import { CORRECTION_PATH, Metric, type Correction, type PromiseFile } from "@ledger/schema";
import { EVENT_LABEL } from "./copy";
import { gbpBn, longDate, rangeText } from "./format";

const FIELD: Record<string, string> = {
  date: "date",
  text: "wording",
  evidence_url: "evidence link",
  type: "type",
  "parameters.how_much_bn_per_year": "cost range",
  "parameters.cost_note": "cost note",
  "parameters.cost_sources": "costing sources",
  "parameters.who": "who pays or benefits",
  "parameters.when": "timing",
  "parameters.funded_by": "how it is paid for",
  "parameters.metric": "target",
  editor_response: "editors' response",
};

/** "Cost range in version 1", "Date of the Delivered event of 1 October 2026". */
export function correctionTarget(c: Correction, file: PromiseFile): string {
  const m = CORRECTION_PATH.exec(c.path);
  if (!m) return c.path;
  const [, list, index, tail] = m;
  const field = FIELD[tail!.slice(1)] ?? tail!.slice(1).replace(/[._]/g, " ");
  const i = Number(index);
  if (list === "versions") return `${field[0]!.toUpperCase()}${field.slice(1)} in version ${i + 1}`;
  if (list === "events") {
    const e = file.events[i];
    return e ? `${field[0]!.toUpperCase()}${field.slice(1)} of the “${EVENT_LABEL[e.type]}” entry` : field;
  }
  return `${field[0]!.toUpperCase()}${field.slice(1)} of a reply`;
}

/** A corrected value in words: ranges as money, dates in full, text quoted. */
export function correctionValue(c: Correction, value: unknown): string {
  if (value === null || value === undefined) return "not given";
  if (c.path.endsWith("how_much_bn_per_year") && Array.isArray(value) && value.length === 3) {
    const r = value as [number, number, number];
    return `${rangeText(r, gbpBn)} a year (central ${gbpBn(r[1])})`;
  }
  if (c.path.endsWith("parameters.metric") && value && typeof value === "object") {
    const t = forecastTarget(value);
    if (t) return t;
  }
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? longDate(value) : `“${value}”`;
  if (Array.isArray(value)) return value.map((v) => (v && typeof v === "object" && "title" in v ? String((v as { title: unknown }).title) : JSON.stringify(v))).join("; ");
  return JSON.stringify(value);
}

/** A target in words, "at most 5.25% by 31 December 2023", or null when the value is not one. */
function forecastTarget(value: unknown): string | null {
  const m = Metric.safeParse(value);
  if (!m.success) return null;
  const dir = { at_least: "at least", at_most: "at most", below: "below" }[m.data.direction];
  const unit = m.data.unit.startsWith("%") ? m.data.unit : ` ${m.data.unit}`;
  return `${dir} ${m.data.target}${unit} by ${longDate(m.data.by)}`;
}
