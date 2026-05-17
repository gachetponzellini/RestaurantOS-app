import { describe, expect, it } from "vitest";

import { normalizePhone } from "./chatbot-actions";

/**
 * Tests for the pure helpers in chatbot-actions.ts. The DB-touching functions
 * (`getReservationPolicyForChatbot`, `checkAvailabilityForChatbot`, etc.) are
 * covered by the manual smoke flow described in the implementation plan;
 * mocking the Supabase service client end-to-end has poor cost/benefit here.
 *
 * normalizePhone is the load-bearing helper for the weak-auth pattern (phone
 * as identity for `list_my_reservations` and `confirm_reservation`). It
 * deserves explicit coverage so regressions stay loud.
 */
describe("normalizePhone", () => {
  it("digit-only phone passes through unchanged", () => {
    expect(normalizePhone("5491155551234")).toBe("5491155551234");
  });

  it("strips spaces, dashes and the leading plus", () => {
    expect(normalizePhone("+54 9 11 5555-1234")).toBe("5491155551234");
    expect(normalizePhone("(11) 5555-1234")).toBe("1155551234");
  });

  it("returns empty for nullish or empty input", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("")).toBe("");
  });

  it("returns empty for non-phone strings (emails, names, gibberish)", () => {
    expect(normalizePhone("juan@example.com")).toBe("");
    expect(normalizePhone("Juan Pérez")).toBe("");
    expect(normalizePhone("test-contact")).toBe("");
  });

  it("returns empty when fewer than 6 digits are present", () => {
    // Short fragments could trigger false positives against real phones in
    // the DB, so we reject anything shorter than 6 digits.
    expect(normalizePhone("abc 12345")).toBe("");
    expect(normalizePhone("12-34-5")).toBe("");
  });

  it("accepts a 6+ digit fragment buried in noise", () => {
    expect(normalizePhone("call me at 1155551234 please")).toBe("1155551234");
  });
});
