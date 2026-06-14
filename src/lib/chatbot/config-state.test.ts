import { afterEach, describe, expect, it } from "vitest";

import {
  ChatbotNotConfiguredError,
  isAnthropicKeyConfigured,
  resolveChatbotState,
} from "./config-state";

describe("resolveChatbotState", () => {
  it("está listo cuando hay key y el bot está habilitado", () => {
    expect(resolveChatbotState({ hasApiKey: true, enabled: true })).toEqual({
      ready: true,
      reason: "ok",
    });
  });

  it("reporta missing_api_key cuando falta la key (aunque esté habilitado)", () => {
    expect(resolveChatbotState({ hasApiKey: false, enabled: true })).toEqual({
      ready: false,
      reason: "missing_api_key",
    });
  });

  it("reporta disabled cuando hay key pero el bot está apagado", () => {
    expect(resolveChatbotState({ hasApiKey: true, enabled: false })).toEqual({
      ready: false,
      reason: "disabled",
    });
  });

  it("prioriza missing_api_key sobre disabled", () => {
    expect(resolveChatbotState({ hasApiKey: false, enabled: false })).toEqual({
      ready: false,
      reason: "missing_api_key",
    });
  });
});

describe("isAnthropicKeyConfigured", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("es true cuando la env tiene un valor no vacío", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret-value";
    expect(isAnthropicKeyConfigured()).toBe(true);
  });

  it("es false cuando la env está vacía o ausente", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(isAnthropicKeyConfigured()).toBe(false);
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicKeyConfigured()).toBe(false);
  });

  it("devuelve un booleano, nunca el valor de la key", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret-value";
    const result = isAnthropicKeyConfigured();
    expect(typeof result).toBe("boolean");
  });
});

describe("ChatbotNotConfiguredError", () => {
  it("lleva el motivo y un mensaje que no filtra la key", () => {
    const err = new ChatbotNotConfiguredError("missing_api_key");
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe("missing_api_key");
    expect(err.message.toLowerCase()).toContain("api key");
    expect(err.message).not.toContain("sk-ant");
  });
});
