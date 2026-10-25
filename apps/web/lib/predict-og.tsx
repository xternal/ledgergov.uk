import { ImageResponse } from "next/og";
import type { PredictAnswers, PredictRound } from "@ledger/schema";
import { MARK_DATA_URI } from "@/lib/brand";
import { OG, ogFonts } from "@/lib/og";
import { closingTime, PREDICT_PATH, picks, shortDay } from "@/lib/predict-copy";
import { siteUrl } from "@/lib/site";

const host = () => new URL(siteUrl()).host;

function Top({ round }: { round: PredictRound }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, fontWeight: 600 }}>
        <img src={MARK_DATA_URI} width={30} height={30} alt="" />
        LedgerGov.UK
      </div>
      <div style={{ display: "flex", fontSize: 22, color: OG.muted, background: OG.sunk, padding: "6px 16px", borderRadius: 999 }}>
        {`${round.budget}, ${shortDay(round.budget_date)}`}
      </div>
    </div>
  );
}

/** The share image of one reader's predictions: every pick, large enough to read in a link preview. */
export async function predictionImage(round: PredictRound, answers: PredictAnswers, open: boolean) {
  const fonts = await ogFonts();
  const shown = picks(round, answers);
  const rows = Math.ceil(shown.length / 2);
  const columns = [shown.slice(0, rows), shown.slice(rows)];
  // Ten picks fit at these sizes; fewer get more room.
  const pickSize = rows > 4 ? 28 : 32;
  const topicSize = rows > 4 ? 18 : 21;
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "46px 64px 42px", fontFamily: "Geist" }}>
      <Top round={round} />
      <div style={{ display: "flex", fontSize: 54, fontWeight: 600, letterSpacing: -1.8, lineHeight: 1.05, marginTop: 24 }}>My Budget predictions</div>
      <div style={{ display: "flex", gap: 48, marginTop: 20, paddingTop: 18, borderTop: `2px solid ${OG.line}` }}>
        {columns.map((col, c) => (
          <div key={c} style={{ display: "flex", flexDirection: "column", flex: 1, gap: rows > 4 ? 9 : 16 }}>
            {col.map((p) => (
              <div key={p.topic} style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                <div style={{ display: "flex", fontSize: topicSize, color: OG.muted }}>{p.topic}</div>
                <div style={{ display: "flex", fontSize: pickSize, fontWeight: 600, letterSpacing: -0.6, color: OG.ink }}>{p.short}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", fontSize: 21, color: OG.muted }}>
        <div style={{ display: "flex" }}>{open ? `Make yours: ${host()}${PREDICT_PATH}` : `How everyone predicted: ${host()}${PREDICT_PATH}`}</div>
        <div style={{ display: "flex", color: OG.rec, fontWeight: 600 }}>{open ? `Open until ${closingTime(round.closes_at)}, ${shortDay(round.closes_at)}` : "Checked against the Budget"}</div>
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}

/** The share image of the prediction page: the call, the subjects of the questions, and when it closes. */
export async function predictPageImage(round: PredictRound, open: boolean) {
  const fonts = await ogFonts();
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.bg, color: OG.ink, padding: "56px 64px", fontFamily: "Geist" }}>
      <Top round={round} />
      <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02, marginTop: 52 }}>
        {open ? "Predict the Budget" : "How readers predicted the Budget"}
      </div>
      <div style={{ display: "flex", fontSize: 30, color: OG.muted, marginTop: 16 }}>
        {`${round.questions.length} questions on what the Chancellor will announce. See how everyone else predicted.`}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 36 }}>
        {round.questions.map((q) => (
          <div key={q.id} style={{ display: "flex", fontSize: 22, color: OG.ink, padding: "7px 16px", borderRadius: 999, border: `2px solid ${OG.line}` }}>
            {q.topic}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 22, color: OG.muted }}>
        <div style={{ display: "flex" }}>{`${host()}${PREDICT_PATH}`}</div>
        <div style={{ display: "flex", color: OG.rec, fontWeight: 600 }}>
          {open ? `Open until ${closingTime(round.closes_at)} on ${shortDay(round.closes_at)}` : "Checked against the Budget documents"}
        </div>
      </div>
    </div>,
    { ...OG.size, fonts },
  );
}

/** For an unknown code: the site's name, as the shared scenarios do. */
export async function plainImage() {
  const fonts = await ogFonts();
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: OG.bg, color: OG.ink, fontSize: 48, alignItems: "center", justifyContent: "center", fontFamily: "Geist" }}>
      LedgerGov.UK
    </div>,
    { ...OG.size, fonts },
  );
}
