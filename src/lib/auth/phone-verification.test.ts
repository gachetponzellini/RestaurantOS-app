import { describe, it } from "vitest";

// ════════════════════════════════════
// SPEC 25 (PENDING) — Suite de verificación por WhatsApp DESACTIVADA.
// Código preservado (comentado). Reactivar al aprobar el template Meta.
// ════════════════════════════════════

describe.skip("spec 25 — phone verification (desactivado)", () => {
  it("reactivar junto con src/lib/auth/phone-verification.ts", () => {});
});

// import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
//
// // ── Estado configurable de las dependencias mockeadas ────────────────
// let isConnected = true;
// let limitSuccess = true;
// let selectRecord: Record<string, unknown> | null = null;
//
// const limitSpy = vi.fn(async () => ({ success: limitSuccess }));
// const isConnectedSpy = vi.fn(async () => isConnected);
// const enqueueSpy = vi.fn(async (_params: unknown) => {});
// const insertSpy = vi.fn(async () => ({ data: null, error: null }));
// const updateSpy = vi.fn((_vals: unknown) => {});
// const getUserByIdSpy = vi.fn(async () => ({
//   data: { user: { user_metadata: { phone: "5491100000000" } } },
//   error: null,
// }));
// const updateUserByIdSpy = vi.fn(async (_id: string, _attrs: unknown) => ({
//   data: { user: {} },
//   error: null,
// }));
//
// // Builder PostgREST falso: thenable (resuelve update/insert) + maybeSingle.
// function makeBuilder() {
//   const b: Record<string, unknown> = {};
//   b.select = () => b;
//   b.insert = insertSpy;
//   b.update = (vals: unknown) => {
//     updateSpy(vals);
//     return b;
//   };
//   b.eq = () => b;
//   b.is = () => b;
//   b.order = () => b;
//   b.limit = () => b;
//   b.maybeSingle = async () => ({ data: selectRecord, error: null });
//   b.then = (resolve: (v: unknown) => void) =>
//     resolve({ data: null, error: null });
//   return b;
// }
//
// vi.mock("@/lib/rate-limit", () => ({
//   limitPhoneVerificationSend: () => limitSpy(),
// }));
// vi.mock("@/lib/notifications/whatsapp-sender", () => ({
//   isWhatsappConnected: () => isConnectedSpy(),
// }));
// vi.mock("@/lib/notifications/whatsapp-outbox", () => ({
//   enqueueWhatsapp: enqueueSpy,
// }));
// vi.mock("@/lib/supabase/service", () => ({
//   createSupabaseServiceClient: () => ({
//     from: () => makeBuilder(),
//     auth: {
//       admin: {
//         getUserById: getUserByIdSpy,
//         updateUserById: updateUserByIdSpy,
//       },
//     },
//   }),
// }));
//
// const {
//   generatePhoneCode,
//   hashPhoneCode,
//   evaluatePhoneCode,
//   requestPhoneCode,
//   verifyPhoneCode,
//   MAX_ATTEMPTS,
// } = await import("./phone-verification");
//
// afterEach(() => {
//   vi.clearAllMocks();
//   isConnected = true;
//   limitSuccess = true;
//   selectRecord = null;
// });
//
// // ─────────────────────────────────────────────────────────────────────
// // Lógica pura
// // ─────────────────────────────────────────────────────────────────────
//
// describe("generatePhoneCode", () => {
//   it("devuelve exactamente 6 dígitos", () => {
//     for (let i = 0; i < 50; i++) {
//       expect(generatePhoneCode()).toMatch(/^\d{6}$/);
//     }
//   });
// });
//
// describe("hashPhoneCode", () => {
//   it("es determinístico y distinto del código en claro", () => {
//     expect(hashPhoneCode("123456")).toBe(hashPhoneCode("123456"));
//     expect(hashPhoneCode("123456")).not.toBe("123456");
//   });
//
//   it("difiere para códigos distintos", () => {
//     expect(hashPhoneCode("123456")).not.toBe(hashPhoneCode("654321"));
//   });
// });
//
// describe("evaluatePhoneCode", () => {
//   const future = new Date(Date.now() + 60_000).toISOString();
//   const past = new Date(Date.now() - 60_000).toISOString();
//   const now = Date.now();
//
//   it("código correcto y vigente → ok", () => {
//     const rec = {
//       code_hash: hashPhoneCode("123456"),
//       expires_at: future,
//       attempts: 0,
//       consumed_at: null,
//     };
//     expect(evaluatePhoneCode(rec, "123456", now)).toBe("ok");
//   });
//
//   it("código que no coincide → mismatch", () => {
//     const rec = {
//       code_hash: hashPhoneCode("123456"),
//       expires_at: future,
//       attempts: 0,
//       consumed_at: null,
//     };
//     expect(evaluatePhoneCode(rec, "000000", now)).toBe("mismatch");
//   });
//
//   it("código expirado → expired (aunque coincida)", () => {
//     const rec = {
//       code_hash: hashPhoneCode("123456"),
//       expires_at: past,
//       attempts: 0,
//       consumed_at: null,
//     };
//     expect(evaluatePhoneCode(rec, "123456", now)).toBe("expired");
//   });
//
//   it("superó el máximo de intentos → max_attempts", () => {
//     const rec = {
//       code_hash: hashPhoneCode("123456"),
//       expires_at: future,
//       attempts: MAX_ATTEMPTS,
//       consumed_at: null,
//     };
//     expect(evaluatePhoneCode(rec, "123456", now)).toBe("max_attempts");
//   });
//
//   it("ya consumido → consumed", () => {
//     const rec = {
//       code_hash: hashPhoneCode("123456"),
//       expires_at: future,
//       attempts: 0,
//       consumed_at: new Date().toISOString(),
//     };
//     expect(evaluatePhoneCode(rec, "123456", now)).toBe("consumed");
//   });
// });
//
// // ─────────────────────────────────────────────────────────────────────
// // requestPhoneCode (orquestación)
// // ─────────────────────────────────────────────────────────────────────
//
// describe("requestPhoneCode", () => {
//   beforeEach(() => {
//     isConnected = true;
//     limitSuccess = true;
//   });
//
//   it("negocio conectado → guarda hash y encola template con el código", async () => {
//     const res = await requestPhoneCode({
//       userId: "u1",
//       businessId: "b1",
//       phone: "5491100000000",
//     });
//
//     expect(res).toEqual({ sent: true });
//     expect(insertSpy).toHaveBeenCalledTimes(1);
//     expect(enqueueSpy).toHaveBeenCalledTimes(1);
//
//     const arg = enqueueSpy.mock.calls[0][0] as {
//       template: { params: string[] };
//       body: string;
//     };
//     // El código va en el template…
//     expect(arg.template.params[0]).toMatch(/^\d{6}$/);
//     // …pero NUNCA en el body persistido en el outbox.
//     expect(arg.body).not.toMatch(/\d{6}/);
//   });
//
//   it("negocio sin WhatsApp → no-op (degradación), no rompe ni envía", async () => {
//     isConnected = false;
//     const res = await requestPhoneCode({
//       userId: "u1",
//       businessId: "b1",
//       phone: "5491100000000",
//     });
//
//     expect(res).toEqual({ sent: false, reason: "whatsapp_unavailable" });
//     expect(insertSpy).not.toHaveBeenCalled();
//     expect(enqueueSpy).not.toHaveBeenCalled();
//   });
//
//   it("rate-limit excedido → no envía y ni siquiera consulta WhatsApp", async () => {
//     limitSuccess = false;
//     const res = await requestPhoneCode({
//       userId: "u1",
//       businessId: "b1",
//       phone: "5491100000000",
//     });
//
//     expect(res).toEqual({ sent: false, reason: "rate_limited" });
//     expect(isConnectedSpy).not.toHaveBeenCalled();
//     expect(enqueueSpy).not.toHaveBeenCalled();
//   });
// });
//
// // ─────────────────────────────────────────────────────────────────────
// // verifyPhoneCode (orquestación)
// // ─────────────────────────────────────────────────────────────────────
//
// describe("verifyPhoneCode", () => {
//   it("código correcto → consume y marca phone_verified en el user", async () => {
//     selectRecord = {
//       id: "c1",
//       code_hash: hashPhoneCode("123456"),
//       expires_at: new Date(Date.now() + 60_000).toISOString(),
//       attempts: 0,
//       consumed_at: null,
//     };
//
//     const res = await verifyPhoneCode({ userId: "u1", code: "123456" });
//
//     expect(res).toEqual({ ok: true });
//     expect(updateUserByIdSpy).toHaveBeenCalledTimes(1);
//     const meta = updateUserByIdSpy.mock.calls[0][1] as {
//       user_metadata: { phone_verified: boolean; phone: string };
//     };
//     expect(meta.user_metadata.phone_verified).toBe(true);
//     // Preserva el resto del metadata (teléfono del alta).
//     expect(meta.user_metadata.phone).toBe("5491100000000");
//   });
//
//   it("código incorrecto → incrementa intentos y no verifica", async () => {
//     selectRecord = {
//       id: "c1",
//       code_hash: hashPhoneCode("123456"),
//       expires_at: new Date(Date.now() + 60_000).toISOString(),
//       attempts: 1,
//       consumed_at: null,
//     };
//
//     const res = await verifyPhoneCode({ userId: "u1", code: "000000" });
//
//     expect(res).toEqual({ ok: false, reason: "mismatch" });
//     expect(updateSpy).toHaveBeenCalledWith({ attempts: 2 });
//     expect(updateUserByIdSpy).not.toHaveBeenCalled();
//   });
//
//   it("código expirado → expired, no verifica", async () => {
//     selectRecord = {
//       id: "c1",
//       code_hash: hashPhoneCode("123456"),
//       expires_at: new Date(Date.now() - 60_000).toISOString(),
//       attempts: 0,
//       consumed_at: null,
//     };
//
//     const res = await verifyPhoneCode({ userId: "u1", code: "123456" });
//
//     expect(res).toEqual({ ok: false, reason: "expired" });
//     expect(updateUserByIdSpy).not.toHaveBeenCalled();
//   });
//
//   it("sin código activo → no_code", async () => {
//     selectRecord = null;
//     const res = await verifyPhoneCode({ userId: "u1", code: "123456" });
//     expect(res).toEqual({ ok: false, reason: "no_code" });
//   });
// });
//
