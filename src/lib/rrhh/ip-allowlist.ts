// ============================================
// Lógica pura para el enforcement de origen del fichaje (spec 11).
//
// Sin dependencias de red ni de Supabase: sólo IPv4 ∈ CIDR. Se testea en
// `ip-allowlist.test.ts`. El deploy on-site es IPv4 sobre la LAN del local;
// IPv6 queda fuera de alcance (devuelve false, nunca matchea de más).
// ============================================

/** Convierte una IPv4 ("a.b.c.d") a entero sin signo de 32 bits, o null si es inválida. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

/**
 * True si `ip` (IPv4) cae dentro de `cidr`. `cidr` puede ser:
 *   - notación CIDR: "192.168.10.0/24"
 *   - IP suelta: "192.168.10.42" (se trata como /32)
 * Cualquier IP o CIDR inválido → false (default deny ante basura).
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf("/");
  const base = slash === -1 ? cidr : cidr.slice(0, slash);
  const bits = slash === -1 ? 32 : Number(cidr.slice(slash + 1));

  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;

  if (bits === 0) return true; // /0 matchea todo
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * True si el origen `ip` está habilitado por la allowlist `cidrs`.
 * Lista vacía → false (default deny). El enforcement a nivel de acción decide
 * qué hacer cuando la lista está vacía (allowlist vacía = sin enforcement);
 * esta función pura siempre exige match contra alguna entrada.
 */
export function isOriginAllowed(
  ip: string | null | undefined,
  cidrs: string[],
): boolean {
  if (!ip || cidrs.length === 0) return false;
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}

/**
 * Extrae la IP del cliente real del header `x-forwarded-for`. El proxy on-site
 * antepone la IP del cliente; el primer hop (izquierda) es el origen real.
 * Devuelve null si el header está ausente o vacío.
 */
export function clientIpFromForwarded(
  xForwardedFor: string | null | undefined,
): string | null {
  if (!xForwardedFor) return null;
  const first = xForwardedFor.split(",")[0]?.trim();
  return first ? first : null;
}

/** Valida que un string sea una IPv4 suelta o un CIDR IPv4 bien formado. */
export function isValidCidr(cidr: string): boolean {
  if (!cidr) return false;
  const slash = cidr.indexOf("/");
  const base = slash === -1 ? cidr : cidr.slice(0, slash);
  if (ipv4ToInt(base) === null) return false;
  if (slash === -1) return true;
  const bitsStr = cidr.slice(slash + 1);
  if (!/^\d{1,2}$/.test(bitsStr)) return false;
  const bits = Number(bitsStr);
  return bits >= 0 && bits <= 32;
}

/** Enmascara un PIN de 4 dígitos para auditoría: "1234" → "1**4". */
export function maskPin(pin: string): string {
  if (pin.length <= 2) return "*".repeat(pin.length);
  return pin[0] + "*".repeat(pin.length - 2) + pin[pin.length - 1];
}
