"use client";

import { useEffect } from "react";

/**
 * Cierra una vista/overlay cuando el usuario presiona Escape.
 *
 * Pensado para las superficies **full-screen que NO son un `Dialog`/`Sheet`
 * compartido** (esos primitivos de Base UI ya cierran con Esc por default). Para
 * un modal común, preferí migrarlo al `Dialog`/`Sheet` compartido antes que usar
 * este hook. Spec 043.
 *
 * @param onClose  callback que cierra la vista.
 * @param enabled  si es `false`, no engancha el listener (default: `true`).
 */
export function useEscapeToClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, enabled]);
}
