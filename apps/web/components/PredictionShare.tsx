"use client";

import { ShareBar } from "./ShareBar";
import { countShare } from "./PredictForm";

/** The share buttons on a set of predictions' own page: the owner shares again, or a friend passes it on. */
export function PredictionShare({ url, title, budget }: { url: string; title: string; budget: string }) {
  return <ShareBar url={url} title={title} text={`Predictions for the ${budget}. What do you think the Chancellor will do?`} label="Share" onShare={countShare} />;
}
