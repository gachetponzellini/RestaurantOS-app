import { describe, expect, it } from "vitest";

import { itemGeneraComanda } from "./bar-routing";

describe("itemGeneraComanda", () => {
  it("mesa de bar + sector que NO expide → no genera comanda", () => {
    expect(
      itemGeneraComanda({ tableIsBar: true, stationExpide: false }),
    ).toBe(false);
  });

  it("mesa de bar + sector que SÍ expide (sanguchería) → genera comanda", () => {
    expect(
      itemGeneraComanda({ tableIsBar: true, stationExpide: true }),
    ).toBe(true);
  });

  it("mesa normal (no bar) → genera comanda siempre, sin importar el sector", () => {
    expect(
      itemGeneraComanda({ tableIsBar: false, stationExpide: false }),
    ).toBe(true);
    expect(
      itemGeneraComanda({ tableIsBar: false, stationExpide: true }),
    ).toBe(true);
  });
});
