import { isShareMethod } from "@ledger/schema";
import { clientKeyFrom, errorText } from "@ledger/server";
import { countShare } from "@ledger/server/predict";
import { getServer } from "@/lib/server";
import { readBody } from "../../submissions/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/predict/shared { method }: one daily count of a share button
 * pressed on a set of predictions. Pages with forms run no client analytics
 * (rule 4); this stores how, never which predictions or who.
 */
export async function POST(req: Request) {
  const body = await readBody(req, 200);
  if (!body || !isShareMethod(body.method)) return new Response(null, { status: 400 });
  try {
    const { db } = await getServer();
    await countShare(db, body.method, clientKeyFrom(req.headers));
  } catch (e) {
    console.error("share count failed:", errorText(e));
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
