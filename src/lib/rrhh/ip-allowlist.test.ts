import { describe, expect, it } from "vitest";

import {
  clientIpFromForwarded,
  ipInCidr,
  isOriginAllowed,
  isValidCidr,
} from "./ip-allowlist";

describe("ipInCidr", () => {
  it("IP dentro del rango /24", () => {
    expect(ipInCidr("192.168.10.42", "192.168.10.0/24")).toBe(true);
  });

  it("IP fuera del rango /24", () => {
    expect(ipInCidr("192.168.11.42", "192.168.10.0/24")).toBe(false);
  });

  it("IP pública fuera de una LAN privada", () => {
    expect(ipInCidr("200.51.23.7", "192.168.10.0/24")).toBe(false);
  });

  it("IP suelta (sin /bits) se trata como /32", () => {
    expect(ipInCidr("192.168.10.42", "192.168.10.42")).toBe(true);
    expect(ipInCidr("192.168.10.43", "192.168.10.42")).toBe(false);
  });

  it("/32 explícito", () => {
    expect(ipInCidr("10.0.0.1", "10.0.0.1/32")).toBe(true);
    expect(ipInCidr("10.0.0.2", "10.0.0.1/32")).toBe(false);
  });

  it("/16 cubre el segmento", () => {
    expect(ipInCidr("172.16.99.250", "172.16.0.0/16")).toBe(true);
    expect(ipInCidr("172.17.0.1", "172.16.0.0/16")).toBe(false);
  });

  it("/0 matchea cualquier IPv4", () => {
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });

  it("IP inválida → false", () => {
    expect(ipInCidr("no-soy-ip", "192.168.10.0/24")).toBe(false);
    expect(ipInCidr("192.168.10.999", "192.168.10.0/24")).toBe(false);
    expect(ipInCidr("", "192.168.10.0/24")).toBe(false);
  });

  it("CIDR inválido → false", () => {
    expect(ipInCidr("192.168.10.42", "192.168.10.0/33")).toBe(false);
    expect(ipInCidr("192.168.10.42", "basura")).toBe(false);
  });
});

describe("isOriginAllowed", () => {
  it("lista vacía → bloquea (default deny en la lógica pura)", () => {
    expect(isOriginAllowed("192.168.10.42", [])).toBe(false);
  });

  it("matchea contra cualquier entrada de la lista", () => {
    const list = ["10.0.0.0/8", "192.168.10.0/24"];
    expect(isOriginAllowed("192.168.10.5", list)).toBe(true);
    expect(isOriginAllowed("10.4.4.4", list)).toBe(true);
    expect(isOriginAllowed("172.16.0.1", list)).toBe(false);
  });

  it("IP nula/desconocida → bloquea aunque haya lista", () => {
    expect(isOriginAllowed(null, ["192.168.10.0/24"])).toBe(false);
    expect(isOriginAllowed("unknown", ["192.168.10.0/24"])).toBe(false);
  });
});

describe("clientIpFromForwarded", () => {
  it("toma el primer hop (cliente real) de x-forwarded-for", () => {
    expect(clientIpFromForwarded("192.168.10.42, 10.0.0.1, 70.41.3.18")).toBe(
      "192.168.10.42",
    );
  });

  it("un solo valor", () => {
    expect(clientIpFromForwarded("192.168.10.42")).toBe("192.168.10.42");
  });

  it("recorta espacios", () => {
    expect(clientIpFromForwarded("  192.168.10.42 , 10.0.0.1")).toBe(
      "192.168.10.42",
    );
  });

  it("header ausente/vacío → null", () => {
    expect(clientIpFromForwarded(null)).toBeNull();
    expect(clientIpFromForwarded(undefined)).toBeNull();
    expect(clientIpFromForwarded("")).toBeNull();
  });
});

describe("isValidCidr", () => {
  it("acepta CIDR válido y/o IP suelta", () => {
    expect(isValidCidr("192.168.10.0/24")).toBe(true);
    expect(isValidCidr("192.168.10.42")).toBe(true);
    expect(isValidCidr("10.0.0.0/8")).toBe(true);
    expect(isValidCidr("0.0.0.0/0")).toBe(true);
  });

  it("rechaza formatos inválidos", () => {
    expect(isValidCidr("192.168.10.0/33")).toBe(false);
    expect(isValidCidr("192.168.10.999")).toBe(false);
    expect(isValidCidr("192.168.10")).toBe(false);
    expect(isValidCidr("basura")).toBe(false);
    expect(isValidCidr("")).toBe(false);
  });
});
