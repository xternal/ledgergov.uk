import { archetypeSituation, householdRows, readNetIncomes, type Situation } from "./households";
import type { T1Provider } from "./provider";
import type { Reform } from "./reform";
import { toT1Population } from "./transform";

/**
 * PolicyEngine's public API (https://api.policyengine.org, no key). Be a good
 * citizen: one request at a time per reader action, short timeouts, and
 * results cached by the service for 30 days.
 */
export const POLICYENGINE_API = "https://api.policyengine.org";

/** PolicyEngine's id for current law, the baseline every reform is compared with. */
export const CURRENT_LAW_ID = 1;

export interface PolicyEngineOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Milliseconds. The economy GET answers at once ("computing") or with the cached result. */
  timeouts?: { policy?: number; economy?: number; calculate?: number; metadata?: number };
  /**
   * Sent as User-Agent so PolicyEngine can see who is calling. The offline Budget job sets it
   * (BUDGET_JOB_USER_AGENT); reader-triggered calls leave it out. It names the site, never a reader.
   */
  userAgent?: string;
}

/**
 * A failed call. The code is all it carries ("http_502", "timeout", "network",
 * "bad_response", "pe_error"): never a response body, which can be large and
 * echoes the request.
 */
export class PolicyEngineError extends Error {
  constructor(readonly code: string) {
    super(`PolicyEngine ${code}`);
    this.name = "PolicyEngineError";
  }
}

export type EconomyStep = { status: "computing" } | { status: "ok"; raw: unknown };

/** /budget-window: several years of one comparison in one request (budget totals only; see docs/MODEL.md T1). */
export type BudgetWindowStep = { status: "computing"; raw: unknown } | { status: "ok"; raw: unknown };

/** What PolicyEngine says it is running: the bundle (/v2/tax-benefit-models) and the household engine's model (/uk/metadata). */
export interface PolicyEngineVersions {
  /** The certified bundle, e.g. "6.2.1" (policyengine.py): the economy runs report it as policyengine_bundle.policyengine_version. */
  bundle: string;
  /** Fiscal years the API offers, as PolicyEngine's simulation years (2024 = 2024-25). */
  years: number[];
  /** PolicyEngine's id for current law. */
  current_law_id: number;
}

export interface PolicyEngineClient {
  createPolicy(data: Reform): Promise<number>;
  /** One year of `policyId` compared with `baselineId` (current law unless given), for the UK. */
  economy(policyId: number, startYear: number, baselineId?: number): Promise<EconomyStep>;
  budgetWindow(policyId: number, baselineId: number, startYear: number, windowSize: number): Promise<BudgetWindowStep>;
  /** A household under a policy: `{}` is current law, or a complete policy such as the pre-Budget one. */
  calculateHousehold(household: Situation, policy: Reform): Promise<unknown>;
  versions(): Promise<PolicyEngineVersions>;
  /** /uk/metadata (1.3 MB, at most 30 a minute: call it rarely): the policyengine-uk version /uk/calculate runs, and every parameter. */
  metadata(): Promise<PolicyEngineMetadata>;
}

/** What the Budget job reads from /uk/metadata: the household engine's version and every parameter with its unit and dated values. */
export interface PolicyEngineMetadata {
  version: string;
  parameters: Record<string, { unit: string | null; values: Record<string, unknown> }>;
}

const DEFAULT_TIMEOUTS = { policy: 10_000, economy: 15_000, calculate: 20_000, metadata: 60_000 };

export function policyEngineClient(opts: PolicyEngineOptions = {}): PolicyEngineClient {
  const base = (opts.baseUrl ?? POLICYENGINE_API).replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
  const agent: Record<string, string> = opts.userAgent ? { "user-agent": opts.userAgent } : {};

  async function call(path: string, timeoutMs: number, body?: unknown): Promise<{ status?: unknown; result?: unknown }> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? { accept: "application/json", ...agent } : { accept: "application/json", "content-type": "application/json", ...agent },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store", // the service caches; never a framework fetch cache
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      throw new PolicyEngineError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new PolicyEngineError(`http_${res.status}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw new PolicyEngineError(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "bad_response");
    }
    if (typeof json !== "object" || json === null) throw new PolicyEngineError("bad_response");
    const out = json as { status?: unknown; result?: unknown };
    if (out.status === "error") throw new PolicyEngineError("pe_error");
    return out;
  }

  return {
    async createPolicy(data) {
      const r = await call("/uk/policy", timeouts.policy, { data });
      const id = (r.result as { policy_id?: unknown } | undefined)?.policy_id;
      if (r.status !== "ok" || typeof id !== "number" || !Number.isInteger(id)) throw new PolicyEngineError("bad_response");
      return id;
    },
    async economy(policyId, startYear, baselineId = CURRENT_LAW_ID) {
      const q = new URLSearchParams({ region: "uk", time_period: String(startYear) });
      const r = await call(`/uk/economy/${policyId}/over/${baselineId}?${q}`, timeouts.economy);
      if (r.status === "computing") return { status: "computing" };
      if (r.status === "ok" && typeof r.result === "object" && r.result !== null) return { status: "ok", raw: r.result };
      throw new PolicyEngineError("bad_response");
    },
    async budgetWindow(policyId, baselineId, startYear, windowSize) {
      const q = new URLSearchParams({ region: "uk", start_year: String(startYear), window_size: String(windowSize) });
      const r = await call(`/uk/economy/${policyId}/over/${baselineId}/budget-window?${q}`, timeouts.economy);
      if (r.status === "ok" && typeof r.result === "object" && r.result !== null) return { status: "ok", raw: r };
      if (r.status === "computing" || r.status === "queued" || r.status === "pending") return { status: "computing", raw: r };
      throw new PolicyEngineError("bad_response");
    },
    async calculateHousehold(household, policy) {
      const r = await call("/uk/calculate", timeouts.calculate, { household, policy });
      if (r.status !== "ok" || typeof r.result !== "object" || r.result === null) throw new PolicyEngineError("bad_response");
      return r.result;
    },
    async versions() {
      const r = await call("/v2/tax-benefit-models/by-country/uk", timeouts.policy);
      const res = r.result as { policyengine_version?: unknown; model_version?: { current_law_id?: unknown; metadata_time_periods?: unknown } } | undefined;
      const bundle = res?.policyengine_version;
      const years = res?.model_version?.metadata_time_periods;
      const current = res?.model_version?.current_law_id;
      if (typeof bundle !== "string" || !Array.isArray(years) || !years.every((y) => Number.isInteger(y)) || typeof current !== "number")
        throw new PolicyEngineError("bad_response");
      return { bundle, years: years as number[], current_law_id: current };
    },
    async metadata() {
      const r = await call("/uk/metadata", timeouts.metadata);
      const res = r.result as { version?: unknown; parameters?: Record<string, { type?: unknown; unit?: unknown; values?: unknown }> } | undefined;
      const v = res?.version;
      if (typeof v !== "string" || !/^\d+\.\d+\.\d+/.test(v) || typeof res?.parameters !== "object") throw new PolicyEngineError("bad_response");
      const parameters: PolicyEngineMetadata["parameters"] = {};
      for (const [path, p] of Object.entries(res.parameters)) {
        if (p?.type !== "parameter") continue;
        parameters[path] = { unit: typeof p.unit === "string" ? p.unit : null, values: (p.values ?? {}) as Record<string, unknown> };
      }
      return { version: v, parameters };
    },
  };
}

/** T1 on PolicyEngine's public API. */
export function policyEngineProvider(opts: PolicyEngineOptions = {}): T1Provider {
  const client = policyEngineClient(opts);
  return {
    name: "policyengine_api",
    async simulate(reform, startYear, handle, now) {
      if (handle === null) return { status: "pending", handle: await client.createPolicy(reform) };
      const step = await client.economy(handle, startYear);
      if (step.status === "computing") return { status: "pending", handle };
      const { population, warnings } = toT1Population(step.raw, { policyId: handle, startYear, fetchedAt: now });
      return { status: "ok", handle, population, warnings };
    },
    async households(reform, startYear, baseline = {}) {
      const situation = archetypeSituation(startYear);
      // The baseline and the reform side by side: two requests at once, so the reader waits for one.
      const [before, after] = await Promise.all([client.calculateHousehold(situation, baseline), client.calculateHousehold(situation, reform)]);
      return householdRows(readNetIncomes(before, startYear), readNetIncomes(after, startYear));
    },
  };
}
