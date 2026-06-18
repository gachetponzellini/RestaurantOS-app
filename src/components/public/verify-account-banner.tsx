import Link from "next/link";

/**
 * Aviso "Verificá tu cuenta" (gate suave, spec 25 D4). Se muestra a clientes
 * logueados sin teléfono verificado en checkout/reserva. NO bloquea la acción:
 * es un link al paso de verificación. Endurecer a gate obligatorio es una
 * decisión de producto posterior.
 */
export function VerifyAccountBanner({ href }: { href: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        background: "var(--hairline)",
        borderLeft: "3px solid var(--ink)",
        textDecoration: "none",
        fontSize: 13,
        lineHeight: 1.3,
      }}
    >
      <span style={{ color: "var(--ink-2)" }}>
        Verificá tu cuenta para asegurarla.
      </span>
      <span style={{ color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>
        Verificar →
      </span>
    </Link>
  );
}
