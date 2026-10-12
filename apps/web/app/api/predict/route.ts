import { clientKeyFrom, errorText } from "@ledger/server";
import { makePrediction, predictionPath } from "@ledger/server/predict";
import { getServer } from "@/lib/server";
import { currentRound } from "@/lib/predict";
import { readBody } from "../submissions/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
/** Ten answers and a spam-check payload fit easily; anything bigger is not a prediction. */
const MAX_BODY = 12_000;

const MESSAGE: Record<string, string> = {
  invalid: "Choose an answer to every question.",
  closed: "Predictions closed when the Budget statement began.",
  spam_check: "The check that you're not a bot did not go through. Wait a moment and try again.",
  rate_limited: "We have had as many predictions as we take from one connection in a day. Please try again tomorrow.",
};

/**
 * POST /api/predict { answers: { question id: option id }, altcha } for the
 * current question set. Responds 201 { code, path, crowd }: the reader's link,
 * and how everyone predicted (null below the site's minimum count). Stores a
 * random code, the answers and the hour; never logs the body.
 */
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ error: "invalid", message: "Send the form as JSON." }, { status: 415, headers: NO_STORE });
  }
  const body = await readBody(req, MAX_BODY);
  if (!body) return Response.json({ error: "invalid", message: MESSAGE.invalid }, { status: 400, headers: NO_STORE });
  try {
    const { db, config } = await getServer();
    const result = await makePrediction(body, { db, config, round: currentRound(), clientKey: clientKeyFrom(req.headers) });
    if (!result.ok) {
      return Response.json(
        { error: result.error, message: MESSAGE[result.error], ...(result.missing ? { missing: result.missing } : {}) },
        { status: result.httpStatus, headers: NO_STORE },
      );
    }
    return Response.json({ code: result.code, path: predictionPath(result.code), crowd: result.crowd }, { status: 201, headers: NO_STORE });
  } catch (e) {
    console.error("prediction failed:", errorText(e));
    return Response.json({ error: "server", message: "Something went wrong and nothing was saved. Please try again in a minute." }, { status: 500, headers: NO_STORE });
  }
}
