import { predictOpen } from "@ledger/schema";
import { errorText } from "@ledger/server";
import { crowd } from "@ledger/server/predict";
import { getServer } from "@/lib/server";
import { currentRound } from "@/lib/predict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/predict/crowd → { open, crowd }. How everyone predicted on the
 * current set, once predictions have closed: before then, readers see it only
 * after making their own (in the answer to POST /api/predict), so the crowd
 * does not steer anyone. Below the site's minimum count the crowd is null.
 */
export async function GET() {
  const round = currentRound();
  if (predictOpen(round)) return Response.json({ open: true, crowd: null }, { headers: { "cache-control": "public, max-age=60" } });
  try {
    const { db, config } = await getServer();
    return Response.json({ open: false, crowd: await crowd(db, round, config.followerCountThreshold) }, { headers: { "cache-control": "public, max-age=300" } });
  } catch (e) {
    console.error("prediction crowd failed:", errorText(e));
    return Response.json({ open: false, crowd: null }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
