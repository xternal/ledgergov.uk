// Predict the Budget (Day 9). Kept as a TypeScript module so the web app bundles it.
export default /* sql */ `
-- A reader's predictions for a Budget: a random code (the share link,
-- /budget/predict/r/<code>), the question set, the answers and the hour they
-- were made. Nothing else: no IP address, user agent, email, name or cookie.
-- The hour is enough to show a prediction came before the Budget and to count
-- predictions per day, and it is too coarse to match a request in a log.
-- Rows are deleted 13 months after they are made (the daily job).
CREATE TABLE IF NOT EXISTS prediction (
  code        TEXT PRIMARY KEY,                -- 10 random characters; public, as the share link
  round       TEXT NOT NULL,                   -- the question set: content/predict/<round>.yaml
  answers     JSONB NOT NULL,                  -- { question id: option id }, every question answered
  made_at     TIMESTAMPTZ NOT NULL             -- rounded down to the hour
);
CREATE INDEX IF NOT EXISTS prediction_round ON prediction (round);
CREATE INDEX IF NOT EXISTS prediction_made_at ON prediction (made_at);
`;
