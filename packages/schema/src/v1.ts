/**
 * Cards and actors in OpenPromises format v1 (`format: openpromises/1`), read
 * back into LedgerGov.UK's own shape (docs/OPENPROMISES_MIGRATION.md, step 2).
 *
 * The files moved to the engine's format; the site did not. Everything that
 * reads content (pages, API, feeds, alerts, validate, the scripts) goes through
 * `legacyCard` / `legacyActor`, so PromiseFile and ActorFile stay the internal
 * shape and every page, feed and API response is built by the same code as
 * before. Files still in the old format pass through unchanged.
 *
 * This is the exact inverse of OpenPromises' `fromPublicLedger` and
 * `fromPublicLedgerActor` (packages/core/src/adapters.ts, 0.4.0): v1.test.ts
 * converts every card forward with the engine and back with this, and expects
 * the original. Three things the converter made from YAML comments have no
 * place in our shape and are dropped here (they were never shown): a
 * contract's `note`, a role's `source` and an actor's `same_as_checked_on`.
 * A cost's `quality` label is dropped too: the API still works it out (step 6).
 *
 * One detail does not survive the engine's converter: a version written with
 * `how_much_bn_per_year: null` ("no stated cost") comes back without the field,
 * which our schema reads the same way (optional and nullable). So history checks
 * compare both sides in the same form (`comparableCard`), as the engine's own
 * append-only check does.
 */

export const V1_FORMAT = "openpromises/1";

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map((x) => (isObj(x) ? x : ({ value: x } as Raw))) : []);
const clean = <T extends Raw>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const isV1 = (raw: unknown): raw is Raw => isObj(raw) && raw.format === V1_FORMAT;

/** A language map back to its English text; strings, null and undefined stay as they are. */
const text = (v: unknown): unknown => (isObj(v) && typeof v.en === "string" ? v.en : v);

/** A reference ({actor_id, note}) with its note back to a string. */
const ref = (v: unknown): unknown => (isObj(v) ? clean({ ...v, note: text(v.note) }) : v);

/** A version's parameters back to their old field names. The deadline is taken off: it belongs to the card. */
function parameters(p: unknown): unknown {
  if (!isObj(p)) return p;
  const { who, cost, when, funded_by, deadline: _deadline, baseline, ...rest } = p;
  const c = isObj(cost) ? cost : {};
  return clean({
    baseline: isObj(baseline) ? clean({ ...baseline, note: text(baseline.note) }) : baseline,
    who: text(who),
    how_much_bn_per_year: c.range,
    costed_by: c.by,
    cost_note: text(c.note),
    cost_sources: c.sources,
    when: text(when),
    funded_by: text(funded_by),
    ...rest,
  });
}

/** How a corrected field's path and values change on the way back (the inverse of the engine's plField). */
function correctionField(listName: string, tail: string): { tail: string; value: (v: unknown) => unknown } {
  const same = (t: string) => ({ tail: t, value: (v: unknown) => v });
  if (listName === "versions") {
    if (tail === ".parameters.cost.range") return same(".parameters.how_much_bn_per_year");
    if (tail === ".parameters.cost.by") return same(".parameters.costed_by");
    if (tail === ".parameters.cost.note") return { tail: ".parameters.cost_note", value: text };
    if (tail === ".parameters.cost.sources") return same(".parameters.cost_sources");
    if ([".parameters.who", ".parameters.when", ".parameters.funded_by"].includes(tail)) return { tail, value: text };
    if (tail === ".parameters") return { tail, value: parameters };
  }
  if (listName === "events" && tail === ".text") return { tail, value: text };
  if (listName === "replies" && tail === ".editor_response") return { tail, value: text };
  return same(tail);
}

const CORRECTION_PATH = /^(versions|events|replies)\[(\d+)\](.*)$/;

function correction(c: Raw): Raw {
  const base = { ...c, reason: text(c.reason) };
  const m = typeof c.path === "string" ? CORRECTION_PATH.exec(c.path) : null;
  if (!m) return clean(base);
  const f = correctionField(m[1]!, m[3]!);
  return clean({ ...base, path: `${m[1]}[${m[2]}]${f.tail}`, was: f.value(c.was), now: f.value(c.now) });
}

/** A contract link without the note the converter made from a comment; a bare OCID again when that is all it holds. */
function contract(r: unknown): unknown {
  if (!isObj(r)) return r;
  const { note: _note, ...rest } = r;
  return Object.keys(rest).length === 1 && typeof rest.ocid === "string" ? rest.ocid : rest;
}

/** A card in format v1 as a LedgerGov.UK card file; anything else unchanged. */
export function legacyCard(raw: unknown): unknown {
  if (!isV1(raw)) return raw;
  const { format: _format, area, responsible, links, x, versions, events, replies, corrections, reviews, ...c } = raw;
  const vs = list(versions);
  const last = vs.length - 1;
  const lastParams = vs[last]?.parameters;
  const extra = isObj(x) ? x : {};
  const { deadline: xDeadline, submission_ref, credit, editor_check_required, ...unknown } = extra;
  const l = isObj(links) ? links : {};
  const lever = isObj(l.lever) ? l.lever : null;
  return clean({
    id: c.id,
    headline: text(c.headline),
    actor_id: c.actor_id,
    made_on: c.made_on,
    venue: c.venue,
    venue_label: text(c.venue_label),
    policy_area: area,
    status: c.status,
    status_note: text(c.status_note),
    deadline: isObj(lastParams) ? lastParams.deadline : xDeadline,
    lever_settings: lever?.settings,
    preset_label: text(lever?.label),
    origin: c.origin,
    submission_ref,
    credit,
    editor_check_required,
    sources: c.sources,
    versions: vs.map(({ parameters: p, ...v }) => clean({ ...v, parameters: parameters(p) })),
    events: list(events).map((e) => clean({ ...e, text: text(e.text) })),
    replies: Array.isArray(replies) ? list(replies).map((r) => clean({ ...r, editor_response: text(r.editor_response) })) : undefined,
    outcome_by: responsible === null ? null : ref(responsible),
    brought_about_by: ref(c.brought_about_by),
    corrections: Array.isArray(corrections) ? list(corrections).map(correction) : undefined,
    reviews: Array.isArray(reviews) ? list(reviews).map((r) => clean({ ...r, note: text(r.note) })) : undefined,
    contracts: Array.isArray(l.contracts) ? l.contracts.map(contract) : undefined,
    ...unknown,
  });
}

const STANDING: Record<string, string> = { in_power: "government", opposition: "opposition", public_body: "public_body" };

/** An actor in format v1 as a LedgerGov.UK actor file; anything else unchanged. */
export function legacyActor(raw: unknown): unknown {
  if (!isV1(raw)) return raw;
  const { format: _format, name, short_name, standing, identifiers, roles, same_as_checked_on: _checked, x, ...a } = raw;
  const ids = isObj(identifiers) ? identifiers : {};
  return clean({
    id: a.id,
    name: text(name),
    short_name: text(short_name),
    kind: a.kind,
    standing: typeof standing === "string" ? (STANDING[standing] ?? standing) : standing,
    party_id: a.party_id,
    roles: Array.isArray(roles) ? list(roles).map(({ title, source: _source, ...r }) => clean({ title: text(title), ...r })) : undefined,
    parliament_member_id: ids.parliament_member_id,
    parliament_party_id: ids.parliament_party_id,
    same_as: a.same_as,
    ...(isObj(x) ? x : {}),
  });
}

/** A card's raw YAML in the one form both formats share, for comparing history across the conversion: an empty cost and a missing one are the same. */
export function comparableCard(raw: unknown): unknown {
  const c = legacyCard(raw);
  if (!isObj(c) || !Array.isArray(c.versions)) return c;
  return {
    ...c,
    versions: c.versions.map((v) =>
      isObj(v) && isObj(v.parameters) && v.parameters.how_much_bn_per_year === null
        ? { ...v, parameters: Object.fromEntries(Object.entries(v.parameters).filter(([k]) => k !== "how_much_bn_per_year")) }
        : v,
    ),
  };
}
