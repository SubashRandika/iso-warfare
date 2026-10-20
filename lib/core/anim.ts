// Small timing helpers every model uses.
export const DEG = Math.PI / 180;
export const SIDES = [1, -1] as const;
export const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** eased 0..1 progress of t through the window [a, b] */
export const phase = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)));
/** move v toward goal by at most rate */
export const approach = (v: number, goal: number, rate: number) => v + Math.sign(goal - v) * Math.min(Math.abs(goal - v), rate);
