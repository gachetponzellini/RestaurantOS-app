import { describe, expect, it } from "vitest";

import { businessHoursSchema, businessHourSlotSchema } from "./schema";

describe("businessHourSlotSchema", () => {
  it("accepts a valid slot", () => {
    const result = businessHourSlotSchema.safeParse({
      day_of_week: 1,
      opens_at: "08:00",
      closes_at: "16:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects closes_at <= opens_at", () => {
    const result = businessHourSlotSchema.safeParse({
      day_of_week: 2,
      opens_at: "16:00",
      closes_at: "12:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same open and close time", () => {
    const result = businessHourSlotSchema.safeParse({
      day_of_week: 3,
      opens_at: "10:00",
      closes_at: "10:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = businessHourSlotSchema.safeParse({
      day_of_week: 0,
      opens_at: "8:00",
      closes_at: "16:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts closes_at 00:00 (midnight)", () => {
    const result = businessHourSlotSchema.safeParse({
      day_of_week: 2,
      opens_at: "20:00",
      closes_at: "00:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects day_of_week out of range", () => {
    expect(
      businessHourSlotSchema.safeParse({
        day_of_week: 7,
        opens_at: "08:00",
        closes_at: "16:00",
      }).success,
    ).toBe(false);
    expect(
      businessHourSlotSchema.safeParse({
        day_of_week: -1,
        opens_at: "08:00",
        closes_at: "16:00",
      }).success,
    ).toBe(false);
  });
});

describe("businessHoursSchema", () => {
  it("accepts empty array (all days closed)", () => {
    expect(businessHoursSchema.safeParse([]).success).toBe(true);
  });

  it("accepts non-overlapping slots on the same day", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 2, opens_at: "08:00", closes_at: "16:00" },
      { day_of_week: 2, opens_at: "20:00", closes_at: "23:00" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts same times on different days", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 1, opens_at: "08:00", closes_at: "16:00" },
      { day_of_week: 2, opens_at: "08:00", closes_at: "16:00" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping slots on the same day", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 5, opens_at: "08:00", closes_at: "16:00" },
      { day_of_week: 5, opens_at: "14:00", closes_at: "20:00" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a slot fully contained in another", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 3, opens_at: "08:00", closes_at: "20:00" },
      { day_of_week: 3, opens_at: "10:00", closes_at: "14:00" },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts non-overlapping slots when one closes at midnight", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 6, opens_at: "08:00", closes_at: "16:00" },
      { day_of_week: 6, opens_at: "20:00", closes_at: "00:00" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping slots when one closes at midnight", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 6, opens_at: "20:00", closes_at: "00:00" },
      { day_of_week: 6, opens_at: "22:00", closes_at: "23:00" },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts adjacent slots (one ends where other starts)", () => {
    const result = businessHoursSchema.safeParse([
      { day_of_week: 4, opens_at: "08:00", closes_at: "16:00" },
      { day_of_week: 4, opens_at: "16:00", closes_at: "23:00" },
    ]);
    expect(result.success).toBe(true);
  });
});
