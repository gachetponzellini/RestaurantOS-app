import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useEscapeToClose } from "./use-escape-to-close";

function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

describe("useEscapeToClose", () => {
  it("llama onClose cuando se presiona Escape", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose));

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignora otras teclas", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose));

    pressKey("Enter");
    pressKey("a");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("limpia el listener al desmontar (no llama onClose después)", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeToClose(onClose));

    unmount();
    pressKey("Escape");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("no engancha el listener cuando enabled es false", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose, false));

    pressKey("Escape");

    expect(onClose).not.toHaveBeenCalled();
  });
});
