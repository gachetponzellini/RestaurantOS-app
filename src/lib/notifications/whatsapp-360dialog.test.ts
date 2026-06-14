import { describe, expect, it } from "vitest";

import {
  buildDialog360Payload,
  normalizeWaPhone,
  parseDialog360Response,
} from "./whatsapp-360dialog";

describe("normalizeWaPhone", () => {
  it("deja sólo dígitos (Meta espera el número sin + ni separadores)", () => {
    expect(normalizeWaPhone("+54 9 11 2233-4455")).toBe("5491122334455");
    expect(normalizeWaPhone("5491122334455")).toBe("5491122334455");
  });
});

describe("buildDialog360Payload", () => {
  it("arma un mensaje de texto Cloud-API", () => {
    const payload = buildDialog360Payload("+5491122334455", {
      kind: "text",
      body: "Hola Ana",
    });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5491122334455",
      type: "text",
      text: { body: "Hola Ana" },
    });
  });

  it("arma un template message con sus parámetros en orden", () => {
    const payload = buildDialog360Payload("5491122334455", {
      kind: "template",
      name: "delivery_preparing",
      lang: "es_AR",
      params: ["Ana", "42"],
    });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5491122334455",
      type: "template",
      template: {
        name: "delivery_preparing",
        language: { code: "es_AR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ana" },
              { type: "text", text: "42" },
            ],
          },
        ],
      },
    });
  });

  it("omite el componente body cuando el template no tiene params", () => {
    const payload = buildDialog360Payload("5491122334455", {
      kind: "template",
      name: "generic",
      lang: "es_AR",
      params: [],
    }) as { template: { components?: unknown[] } };
    expect(payload.template.components).toBeUndefined();
  });
});

describe("parseDialog360Response", () => {
  it("éxito → ok con el message id del provider", () => {
    const res = parseDialog360Response(201, {
      messages: [{ id: "wamid.ABC123" }],
    });
    expect(res).toEqual({ ok: true, messageId: "wamid.ABC123" });
  });

  it("error con detalle de Meta → ok:false con mensaje legible", () => {
    const res = parseDialog360Response(400, {
      error: { message: "Template not found", code: 132001 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Template not found");
  });

  it("error sin cuerpo parseable → mensaje genérico con el status", () => {
    const res = parseDialog360Response(500, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("500");
  });
});
