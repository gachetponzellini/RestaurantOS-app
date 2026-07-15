"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cancelOwnReservation } from "@/lib/reservations/booking-actions";

export function CancelReservationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  // Cerrar con Escape mientras el diálogo está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function confirmCancel() {
    start(async () => {
      const result = await cancelOwnReservation({ id });
      if (result.ok) {
        toast.success("Reserva cancelada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        style={{
          height: 44,
          padding: "0 18px",
          borderRadius: 12,
          background: "var(--bg)",
          color: "var(--ink-2)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: -0.1,
          border: "1px solid var(--hairline-2)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        {pending ? "Cancelando…" : "Cancelar reserva"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cancelación de la reserva"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "var(--bg)",
              border: "1px solid var(--hairline)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: -0.2,
                color: "var(--ink)",
              }}
            >
              ¿Cancelar la reserva?
            </h2>
            <p
              style={{
                margin: "8px 0 18px",
                fontSize: 14,
                lineHeight: 1.45,
                color: "var(--ink-3)",
              }}
            >
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                disabled={pending}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: "var(--bg)",
                  color: "var(--ink-2)",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "1px solid var(--hairline)",
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                No, volver
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={pending}
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 12,
                  background: "#dc2626",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "1px solid #dc2626",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
              >
                {pending ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
