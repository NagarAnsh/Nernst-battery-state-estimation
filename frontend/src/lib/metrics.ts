/** Error metrics shared by the mock estimator and (later) result display. */

export function rmse(pred: number[], ref: number[]): number {
  const n = Math.min(pred.length, ref.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const e = pred[i] - ref[i];
    s += e * e;
  }
  return Math.sqrt(s / n);
}

export function mae(pred: number[], ref: number[]): number {
  const n = Math.min(pred.length, ref.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i] - ref[i]);
  return s / n;
}

export function maxAbsError(pred: number[], ref: number[]): number {
  const n = Math.min(pred.length, ref.length);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(pred[i] - ref[i]));
  return m;
}
