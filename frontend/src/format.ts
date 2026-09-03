/** One decimal, with a real minus sign (U+2212) for negatives. */
export const fmt1 = (n: number): string =>
  (n < 0 ? '−' : '') + Math.abs(n).toFixed(1)
