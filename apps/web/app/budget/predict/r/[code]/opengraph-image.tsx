import { predictOpen } from "@ledger/schema";
import { getPrediction } from "@ledger/server/predict";
import { OG } from "@/lib/og";
import { getServer } from "@/lib/server";
import { roundById } from "@/lib/predict";
import { plainImage, predictionImage } from "@/lib/predict-og";

export const alt = "A reader's Budget predictions on LedgerGov.UK: their answer to each question, and where to make your own";
export const size = OG.size;
export const contentType = "image/png";
/** Like the page: a set of predictions never changes, so each image is drawn once and kept. */
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { db } = await getServer();
  const prediction = await getPrediction(db, code);
  const round = prediction ? roundById(prediction.round) : null;
  if (!prediction || !round) return plainImage();
  return predictionImage(round, prediction.answers, predictOpen(round));
}
