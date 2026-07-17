import { describe, it, expect } from "vitest";

import { composeItemNotes, ENTRADA_MARKER } from "./item-notes";

describe("composeItemNotes", () => {
  it("sin marcador ni texto: string vacío", () => {
    expect(composeItemNotes({ asEntrada: false, freeText: "" })).toBe("");
  });

  it("solo texto libre: lo devuelve tal cual (trim)", () => {
    expect(composeItemNotes({ asEntrada: false, freeText: "  sin sal " })).toBe(
      "sin sal",
    );
  });

  it("solo marcador: devuelve exactamente el marcador, sin separador colgando", () => {
    expect(composeItemNotes({ asEntrada: true, freeText: "" })).toBe(
      ENTRADA_MARKER,
    );
  });

  it("marcador + texto: antepone el marcador con separador", () => {
    expect(composeItemNotes({ asEntrada: true, freeText: "sin sal" })).toBe(
      `${ENTRADA_MARKER} · sin sal`,
    );
  });

  it("marcador + texto con espacios: trimea el texto libre", () => {
    expect(
      composeItemNotes({ asEntrada: true, freeText: "   bien cocido  " }),
    ).toBe(`${ENTRADA_MARKER} · bien cocido`);
  });

  it("respeta el tope de 200 chars, conservando el marcador al frente", () => {
    const largo = "x".repeat(300);
    const out = composeItemNotes({ asEntrada: true, freeText: largo });
    expect(out.length).toBe(200);
    expect(out.startsWith(ENTRADA_MARKER)).toBe(true);
  });

  it("texto libre solo, tope de 200 chars", () => {
    const largo = "y".repeat(300);
    expect(composeItemNotes({ asEntrada: false, freeText: largo }).length).toBe(
      200,
    );
  });
});
