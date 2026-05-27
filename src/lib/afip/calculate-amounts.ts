type AmountBreakdown = {
  totalCents: number;
  netoCents: number;
  ivaCents: number;
  ivaRate: number;
};

export function calculateAmounts(
  totalCents: number,
  ivaRate = 21,
): AmountBreakdown {
  const divisor = 1 + ivaRate / 100;
  const netoCents = Math.round(totalCents / divisor);
  const ivaCents = totalCents - netoCents;
  return { totalCents, netoCents, ivaCents, ivaRate };
}
