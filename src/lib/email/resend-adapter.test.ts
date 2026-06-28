import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildResendPayload,
  composeFrom,
  parseResendResponse,
} from "./resend-adapter";
import { sendEmail } from "./send";

describe("buildResendPayload", () => {
  it("normaliza `to` string a array y arma el payload", () => {
    const p = buildResendPayload({
      from: "Resumen <noreply@pedidos.com.ar>",
      to: "dueno@golf.com",
      subject: "Cierre",
      html: "<b>hola</b>",
      text: "hola",
    });
    expect(p.to).toEqual(["dueno@golf.com"]);
    expect(p.from).toBe("Resumen <noreply@pedidos.com.ar>");
    expect(p.subject).toBe("Cierre");
    expect(p.html).toBe("<b>hola</b>");
    expect(p.text).toBe("hola");
  });

  it("omite `text` cuando no se pasa y respeta array de destinatarios", () => {
    const p = buildResendPayload({
      from: "x@y.com",
      to: ["a@b.com", "c@d.com"],
      subject: "s",
      html: "<p>h</p>",
    });
    expect(p.to).toEqual(["a@b.com", "c@d.com"]);
    expect("text" in p).toBe(false);
  });
});

describe("composeFrom", () => {
  it("usa el display name conservando la dirección pelada", () => {
    expect(composeFrom("noreply@pedidos.com.ar", "Golf")).toBe(
      "Golf <noreply@pedidos.com.ar>",
    );
  });

  it("reemplaza el nombre cuando EMAIL_FROM ya trae uno", () => {
    expect(composeFrom("Resumen <noreply@pedidos.com.ar>", "House")).toBe(
      "House <noreply@pedidos.com.ar>",
    );
  });

  it("deja el From tal cual si no hay display name", () => {
    expect(composeFrom("Resumen <noreply@pedidos.com.ar>")).toBe(
      "Resumen <noreply@pedidos.com.ar>",
    );
  });
});

describe("parseResendResponse", () => {
  it("2xx con id → ok", () => {
    expect(parseResendResponse(200, { id: "re_123" })).toEqual({
      ok: true,
      id: "re_123",
    });
  });

  it("2xx sin id → ok con id null", () => {
    expect(parseResendResponse(200, {})).toEqual({ ok: true, id: null });
  });

  it("error con message → lo propaga saneado", () => {
    const r = parseResendResponse(422, { message: "Invalid `to`" });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining("Invalid `to`") });
  });

  it("error sin cuerpo → mensaje genérico con status", () => {
    const r = parseResendResponse(500, null);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringContaining("500") });
  });
});

describe("sendEmail (best-effort)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin RESEND_API_KEY → ok:false, no lanza, no filtra config", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const r = await sendEmail({
      to: ["a@b.com"],
      subject: "s",
      html: "<p>h</p>",
    });
    expect(r.ok).toBe(false);
  });

  it("sin destinatarios → ok:false sin tocar la red", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "noreply@pedidos.com.ar");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendEmail({ to: [], subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si fetch falla, no lanza y nunca incluye la API key en el error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_supersecret");
    vi.stubEnv("EMAIL_FROM", "noreply@pedidos.com.ar");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const r = await sendEmail({
      to: ["a@b.com"],
      subject: "s",
      html: "<p>h</p>",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("re_supersecret");
  });

  it("2xx → ok con id y manda Bearer + payload correcto", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "noreply@pedidos.com.ar");
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: "re_abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendEmail({
      to: ["dueno@golf.com"],
      subject: "Cierre del día",
      html: "<p>resumen</p>",
      fromName: "Golf",
    });
    expect(r).toMatchObject({ ok: true, id: "re_abc" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const sentBody = JSON.parse(init.body);
    expect(sentBody.from).toBe("Golf <noreply@pedidos.com.ar>");
    expect(sentBody.to).toEqual(["dueno@golf.com"]);
  });
});
