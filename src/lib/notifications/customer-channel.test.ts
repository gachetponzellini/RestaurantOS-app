import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOMER_CHANNEL,
  isCustomerChannel,
  normalizeCustomerChannel,
  pickChannels,
} from "./customer-channel";

describe("normalizeCustomerChannel", () => {
  it("acepta los tres valores válidos", () => {
    expect(normalizeCustomerChannel("whatsapp")).toBe("whatsapp");
    expect(normalizeCustomerChannel("email")).toBe("email");
    expect(normalizeCustomerChannel("both")).toBe("both");
  });

  it("cae al default con null/undefined/valor desconocido", () => {
    expect(normalizeCustomerChannel(null)).toBe(DEFAULT_CUSTOMER_CHANNEL);
    expect(normalizeCustomerChannel(undefined)).toBe(DEFAULT_CUSTOMER_CHANNEL);
    expect(normalizeCustomerChannel("sms")).toBe(DEFAULT_CUSTOMER_CHANNEL);
    expect(DEFAULT_CUSTOMER_CHANNEL).toBe("whatsapp");
  });
});

describe("isCustomerChannel", () => {
  it("valida el enum", () => {
    expect(isCustomerChannel("email")).toBe(true);
    expect(isCustomerChannel("push")).toBe(false);
    expect(isCustomerChannel(null)).toBe(false);
  });
});

describe("pickChannels", () => {
  it("whatsapp → solo whatsapp", () => {
    expect(pickChannels("whatsapp")).toEqual({ whatsapp: true, email: false });
  });

  it("email → solo email", () => {
    expect(pickChannels("email")).toEqual({ whatsapp: false, email: true });
  });

  it("both → ambos", () => {
    expect(pickChannels("both")).toEqual({ whatsapp: true, email: true });
  });
});
