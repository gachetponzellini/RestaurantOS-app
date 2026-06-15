import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyWhatsappSignature } from "./whatsapp-webhook-verify";

const SECRET = "app-secret-xyz";
const body = JSON.stringify({ entry: [{ id: "1", changes: [] }] });

function sign(payload: string, secret = SECRET): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(payload, "utf8").digest("hex")
  );
}

describe("verifyWhatsappSignature", () => {
  it("firma válida → true", () => {
    expect(
      verifyWhatsappSignature({
        rawBody: body,
        signatureHeader: sign(body),
        appSecret: SECRET,
      }),
    ).toBe(true);
  });

  it("body alterado → false", () => {
    const sig = sign(body); // firma del body original
    expect(
      verifyWhatsappSignature({
        rawBody: body + " ", // un byte distinto
        signatureHeader: sig,
        appSecret: SECRET,
      }),
    ).toBe(false);
  });

  it("secreto distinto → false", () => {
    expect(
      verifyWhatsappSignature({
        rawBody: body,
        signatureHeader: sign(body, "otro-secreto"),
        appSecret: SECRET,
      }),
    ).toBe(false);
  });

  it("header ausente, vacío o sin prefijo → false (fail-closed, sin throw)", () => {
    for (const h of [null, undefined, "", "md5=abc", "sha256=", "sha256=zz", "sha256=abc"]) {
      expect(
        verifyWhatsappSignature({
          rawBody: body,
          signatureHeader: h,
          appSecret: SECRET,
        }),
      ).toBe(false);
    }
  });

  it("appSecret vacío → false", () => {
    expect(
      verifyWhatsappSignature({
        rawBody: body,
        signatureHeader: sign(body),
        appSecret: "",
      }),
    ).toBe(false);
  });
});
