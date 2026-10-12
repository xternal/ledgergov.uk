import { predictOpen } from "@ledger/schema";
import { OG } from "@/lib/og";
import { currentRound } from "@/lib/predict";
import { predictPageImage } from "@/lib/predict-og";

export const alt = "Predict the Budget on LedgerGov.UK: the subjects of the questions, and when predictions close";
export const size = OG.size;
export const contentType = "image/png";
/** Same as the page: turns to "how readers predicted" soon after the statement starts. */
export const revalidate = 300;

export default async function Image() {
  const round = currentRound();
  return predictPageImage(round, predictOpen(round));
}
