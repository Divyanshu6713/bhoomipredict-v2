/**
 * The risk score is NOT a second model output. It is the model's delay
 * probability (chance that the milestone slips by more than 30 days) expressed
 * on a 0–100 scale, clamped to 1–99 so a model score never reads as certainty.
 *
 *   riskScore = clamp(round(probability × 100), 1, 99)
 *
 * The one exception is a probability of exactly 0, which the model's sigmoid
 * never produces: it means there are no open parcels left to score (e.g. a
 * project at its last step with nothing pending), and the score is then 0.
 *
 * Every place that shows a risk score derives it here, so "70%" and "70/100"
 * on one screen are, by construction, the same number.
 */
export const riskScoreOf = (probability) => (probability === 0 ? 0 : Math.min(99, Math.max(1, Math.round((probability ?? 0) * 100))));

/** Milestone delay tolerance: "late" means more than this many days past the due date. */
export const DELAY_THRESHOLD_DAYS = 30;
