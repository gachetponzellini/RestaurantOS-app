import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useOptimisticAction } from "./use-optimistic-action";
import type { ActionResult } from "@/lib/actions";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (msg: string) => toastError(msg) },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useOptimisticAction", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it("aplica el overlay optimista y expone pending mientras corre", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction(0, (state: number, delta: number) => state + delta),
    );

    const d = deferred<ActionResult<unknown>>();
    act(() => {
      result.current.run(5, () => d.promise);
    });

    expect(result.current.state).toBe(5);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      d.resolve({ ok: true, data: null });
      await d.promise;
    });

    // Sin revalidación real en el test, al terminar la transición el overlay se
    // descarta y vuelve a `base`. En la app, `base` ya viene revalidado.
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.state).toBe(0);
  });

  it("no togglea toast en éxito", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction(0, (s: number, n: number) => s + n),
    );

    await act(async () => {
      result.current.run(1, async () => ({ ok: true, data: null }));
    });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("togglea toast y revierte cuando la action devuelve { ok: false }", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction("idle", (_s: string, next: string) => next),
    );

    await act(async () => {
      result.current.run("ocupada", async () => ({
        ok: false,
        error: "Transición no permitida.",
      }));
    });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(toastError).toHaveBeenCalledWith("Transición no permitida.");
    expect(result.current.state).toBe("idle"); // rollback
  });

  it("llama onError y suprime el toast cuando errorToast es false", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticAction(0, (s: number, n: number) => s + n),
    );

    await act(async () => {
      result.current.run(1, async () => ({ ok: false, error: "boom" }), {
        errorToast: false,
        onError,
      });
    });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(onError).toHaveBeenCalledWith("boom");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("togglea toast cuando la action lanza", async () => {
    const { result } = renderHook(() =>
      useOptimisticAction(0, (s: number, n: number) => s + n),
    );

    await act(async () => {
      result.current.run(1, async () => {
        throw new Error("network down");
      });
    });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(toastError).toHaveBeenCalledWith("network down");
  });
});
