import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Portrait } from "@ledger/schema/portraits";
import { OG, ogFonts } from "./og";
import { MARK_DATA_URI } from "@/lib/brand";

/** Amber for "in progress", as on the page (styles/tokens.css --warn); next/og has no CSS variables. */
const WARN = "#A3480A";

export interface ActorImage {
  name: string;
  /** "Prime Minister, Labour Party"; empty when there is none. */
  role: string;
  /** UK Parliament's official portrait, when the actor is an MP who has one (docs/OPERATIONS.md §18). */
  portrait: Portrait | null;
  total: number;
  delivered: number;
  inProgress: number;
  notMetOrUndone: number;
}

/** The portrait as a data URI: next/og draws only what it is handed, and the site serves its own copy. */
async function portraitData(p: Portrait): Promise<string> {
  const file = join(process.cwd(), "public", p.src.replace(/^\//, ""));
  return `data:image/jpeg;base64,${(await readFile(file)).toString("base64")}`;
}

/**
 * An actor's share image (1200x630), the same for every actor: the official portrait when Parliament publishes one,
 * with its credit, then the name, the role and the page's own numbers (promises on the ledger, delivered, in progress,
 * not met or undone). Light theme, one typeface, numbers first; the mark as on every share image.
 */
export async function actorImage(a: ActorImage) {
  const fonts = await ogFonts();
  const photo = a.portrait ? await portraitData(a.portrait) : null;
  const figures = [
    { value: a.delivered, label: "delivered", color: OG.good },
    { value: a.inProgress, label: "in progress", color: WARN },
    { value: a.notMetOrUndone, label: "not met or undone", color: a.notMetOrUndone ? OG.bad : OG.muted },
  ];
  const nameSize = a.name.length > 24 ? 56 : 68;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "48px 56px", gap: 48, fontFamily: "Geist" }}>
      {photo && a.portrait && (
        <div style={{ display: "flex", flexDirection: "column", width: 375, flexShrink: 0 }}>
          <img src={photo} width={375} height={500} alt="" style={{ borderRadius: 16, objectFit: "cover", border: `1px solid ${OG.line}` }} />
          <div style={{ display: "flex", marginTop: 10, fontSize: 16, color: OG.muted }}>{`Official portrait${a.portrait.taken ? `, ${a.portrait.taken}` : ""}: ${a.portrait.credit}, ${a.portrait.licence.name}, cropped`}</div>
        </div>
      )}
      {/* flexBasis 0: the column takes the room beside the portrait and long lines wrap, rather than growing past the edge. */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 600 }}>
          <img src={MARK_DATA_URI} width={26} height={26} alt="" />
          LedgerGov.UK
          <span style={{ marginLeft: 10, color: OG.muted }}>Promises</span>
        </div>
        <div style={{ display: "flex", fontSize: nameSize, fontWeight: 600, letterSpacing: -2.4, lineHeight: 1.05, marginTop: 40 }}>{a.name}</div>
        {a.role && <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 12 }}>{a.role}</div>}
        <div style={{ display: "flex", fontSize: 34, fontWeight: 600, marginTop: 32 }}>
          {a.total ? `${a.total} ${a.total === 1 ? "promise" : "promises"} on the ledger` : "No promises on the ledger yet"}
        </div>
        {a.total > 0 && (
          <div style={{ display: "flex", gap: 44, marginTop: "auto" }}>
            {figures.map((f) => (
              <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1, color: f.color }}>{String(f.value)}</div>
                <div style={{ display: "flex", fontSize: 24, color: OG.ink, marginTop: 8 }}>{f.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", marginTop: a.total ? 22 : "auto", fontSize: 20, color: OG.muted }}>Every promise word for word, one standard for every party</div>
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}
