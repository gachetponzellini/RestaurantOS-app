import { afterEach, describe, expect, it, vi } from "vitest";

// Controla el resultado de `.limit()` por prefijo de limitador.
const successByPrefix: Record<string, boolean> = {};

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class FakeRatelimit {
    prefix: string;
    constructor(opts: { prefix: string }) {
      this.prefix = opts.prefix;
    }
    static slidingWindow() {
      return { kind: "sliding" };
    }
    async limit(_key: string) {
      return { success: successByPrefix[this.prefix] ?? true };
    }
  }
  return { Ratelimit: FakeRatelimit };
});

// Carga fresca del módulo con/sin Upstash configurado (los limitadores son
// singletons de módulo; reseteamos para controlar el env por test).
async function load(opts: { upstash: boolean }) {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", opts.upstash ? "http://redis" : "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", opts.upstash ? "tok" : "");
  return import("./rate-limit");
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const k of Object.keys(successByPrefix)) delete successByPrefix[k];
});

describe("limitChatbotTurn", () => {
  it("sin Upstash configurado → degradación elegante (deja pasar)", async () => {
    const { limitChatbotTurn } = await load({ upstash: false });
    expect(await limitChatbotTurn("b1", "5491100000000")).toEqual({
      success: true,
    });
  });

  it("contacto excede su límite por minuto → rechaza el turno", async () => {
    successByPrefix["pedidos:chatbot:contact"] = false;
    successByPrefix["pedidos:chatbot:business"] = true;
    const { limitChatbotTurn } = await load({ upstash: true });
    expect((await limitChatbotTurn("b1", "5491100000000")).success).toBe(false);
  });

  it("negocio excede el techo horario → rechaza aunque el contacto esté ok", async () => {
    successByPrefix["pedidos:chatbot:contact"] = true;
    successByPrefix["pedidos:chatbot:business"] = false;
    const { limitChatbotTurn } = await load({ upstash: true });
    expect((await limitChatbotTurn("b1", "5491100000000")).success).toBe(false);
  });

  it("ambos niveles ok → permite el turno", async () => {
    successByPrefix["pedidos:chatbot:contact"] = true;
    successByPrefix["pedidos:chatbot:business"] = true;
    const { limitChatbotTurn } = await load({ upstash: true });
    expect((await limitChatbotTurn("b1", "5491100000000")).success).toBe(true);
  });
});

describe("limitPhoneVerificationSend", () => {
  it("sin Upstash configurado → degradación elegante (deja pasar)", async () => {
    const { limitPhoneVerificationSend } = await load({ upstash: false });
    expect(await limitPhoneVerificationSend("user-1")).toEqual({
      success: true,
    });
  });

  it("cooldown excedido → no envía aunque el techo horario esté ok", async () => {
    successByPrefix["pedidos:phoneverify:cooldown"] = false;
    successByPrefix["pedidos:phoneverify:hour"] = true;
    const { limitPhoneVerificationSend } = await load({ upstash: true });
    expect((await limitPhoneVerificationSend("user-1")).success).toBe(false);
  });

  it("techo horario excedido → no envía aunque pase el cooldown", async () => {
    successByPrefix["pedidos:phoneverify:cooldown"] = true;
    successByPrefix["pedidos:phoneverify:hour"] = false;
    const { limitPhoneVerificationSend } = await load({ upstash: true });
    expect((await limitPhoneVerificationSend("user-1")).success).toBe(false);
  });

  it("ambos niveles ok → permite el envío", async () => {
    successByPrefix["pedidos:phoneverify:cooldown"] = true;
    successByPrefix["pedidos:phoneverify:hour"] = true;
    const { limitPhoneVerificationSend } = await load({ upstash: true });
    expect((await limitPhoneVerificationSend("user-1")).success).toBe(true);
  });
});
