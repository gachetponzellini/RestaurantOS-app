import { describe, expect, it } from "vitest";

import { calculateAmounts } from "./calculate-amounts";

describe("calculateAmounts", () => {
  it("splits total into neto + iva at 21%", () => {
    const r = calculateAmounts(12100);
    expect(r.netoCents).toBe(10000);
    expect(r.ivaCents).toBe(2100);
    expect(r.netoCents + r.ivaCents).toBe(r.totalCents);
  });

  it("handles non-round totals", () => {
    const r = calculateAmounts(1500);
    expect(r.netoCents + r.ivaCents).toBe(1500);
    expect(r.ivaRate).toBe(21);
  });

  it("works with 10.5% IVA", () => {
    const r = calculateAmounts(11050, 10.5);
    expect(r.netoCents).toBe(10000);
    expect(r.ivaCents).toBe(1050);
    expect(r.ivaRate).toBe(10.5);
  });

  it("handles zero", () => {
    const r = calculateAmounts(0);
    expect(r.netoCents).toBe(0);
    expect(r.ivaCents).toBe(0);
  });
});
