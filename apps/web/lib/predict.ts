import "server-only";
import type { PredictRound } from "@ledger/schema";
import { loadPredictRounds } from "@ledger/schema/predict";

/**
 * Predict the Budget: the question sets in content/predict/*.yaml, read once
 * per process. The newest Budget's set is the one /budget/predict asks; older
 * sets stay so their share links keep showing what people picked.
 */
let cached: PredictRound[] | null = null;

export function predictRounds(): PredictRound[] {
  cached ??= loadPredictRounds();
  return cached;
}

/** The set /budget/predict asks: the newest Budget's. */
export function currentRound(): PredictRound {
  const round = predictRounds()[0];
  if (!round) throw new Error("content/predict/ has no question set");
  return round;
}

export const roundById = (id: string) => predictRounds().find((r) => r.id === id) ?? null;
