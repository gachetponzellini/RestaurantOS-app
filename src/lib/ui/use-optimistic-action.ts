"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions";

export type OptimisticRunOptions = {
  /** Llamado con el mensaje si la action devuelve `{ ok: false }` o lanza. */
  onError?: (error: string) => void;
  /** Si es `false`, no dispara `toast.error` automático (default: `true`). */
  errorToast?: boolean;
};

export type OptimisticAction<TState, TAction> = {
  /** Estado a renderizar: `base` del server + overlay optimista durante la transición. */
  state: TState;
  /** Aplica el cambio optimista y corre la Server Action en la misma transición. */
  run: (
    optimistic: TAction,
    action: () => Promise<ActionResult<unknown>>,
    options?: OptimisticRunOptions,
  ) => void;
  /** `true` mientras la transición (y su action) está en curso. */
  pending: boolean;
};

/**
 * Envuelve una Server Action con una actualización optimista de estado local.
 *
 * El overlay optimista vive **solo** dentro de la transición que dispara `run`:
 * cuando la action termina, React lo descarta y vuelve a `base`. Si la action
 * tuvo éxito, `base` ya fue revalidado por el server (`revalidatePath` /
 * `router.refresh()`) y coincide; si falló, `base` quedó igual → **rollback
 * automático**. El `base` debe venir de props del server (fuente de verdad);
 * el helper nunca persiste estado por su cuenta.
 *
 * Regla de uso (ver spec 21): solo para mutaciones **seguras** (estado de
 * entidades ya persistidas, sin dinero). Nada de plata / creación que rutea a
 * cocina / fiscal / destructivo.
 */
export function useOptimisticAction<TState, TAction>(
  base: TState,
  reducer: (state: TState, action: TAction) => TState,
): OptimisticAction<TState, TAction> {
  const [state, applyOptimistic] = useOptimistic(base, reducer);
  const [pending, startTransition] = useTransition();

  const run: OptimisticAction<TState, TAction>["run"] = (
    optimistic,
    action,
    options,
  ) => {
    const { onError, errorToast = true } = options ?? {};
    startTransition(async () => {
      // `applyOptimistic` debe llamarse dentro de la transición; el overlay se
      // muestra hasta que esta transición concreta termina (sin flicker aunque
      // realtime dispare un refresh en el medio).
      applyOptimistic(optimistic);

      let result: ActionResult<unknown>;
      try {
        result = await action();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Ocurrió un error inesperado.";
        if (errorToast) toast.error(message);
        onError?.(message);
        return;
      }

      if (!result.ok) {
        if (errorToast) toast.error(result.error);
        onError?.(result.error);
      }
    });
  };

  return { state, run, pending };
}
