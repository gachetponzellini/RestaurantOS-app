import type { BusinessRole } from "@/lib/admin/context";

/**
 * Jerarquía de visibilidad de notificaciones broadcast (`target_role`).
 *
 * Principio de producto: **"el dueño ve todo, el mozo ve lo suyo"**. Los avisos
 * operativos se emiten a `target_role: "encargado"`; sin jerarquía, ni el dueño
 * (rol `admin`) ni el platform-admin (rol nominal `admin`) los verían en el bell.
 *
 *   admin (dueño / platform admin) → ve admin + encargado + mozo
 *   encargado                      → ve encargado + mozo
 *   mozo / personal                → ve solo lo suyo
 *
 * Devuelve los `target_role` que `role` puede ver en su feed. Las notis
 * dirigidas por `user_id` puntual se resuelven aparte (no pasan por acá).
 *
 * Módulo puro (sin DB / sin `server-only`) a propósito: lo consumen tanto la
 * query del server (`queries.ts`) como el filtro `isMine` del hook cliente
 * (`use-notifications-realtime.ts`), y deben coincidir exactamente.
 *
 * ⚠️ Los valores devueltos son un allowlist fijo (no vienen de input externo):
 * es seguro interpolarlos en el `.or(...target_role.in.(...))` de PostgREST.
 */
export function visibleTargetRoles(role: BusinessRole | null): BusinessRole[] {
  switch (role) {
    case "admin":
      return ["admin", "encargado", "mozo"];
    case "encargado":
      return ["encargado", "mozo"];
    case "mozo":
      return ["mozo"];
    case "personal":
      return ["personal"];
    default:
      // role null = platform admin sin membership (ver layout admin, que ya
      // lo mapea a "admin" nominal). Lo tratamos como dueño → ve todo.
      return ["admin", "encargado", "mozo"];
  }
}

/**
 * Arma el filtro `.or(...)` de PostgREST para `listForUser`/`countUnread`:
 * notif dirigida a este `userId`, o broadcast a cualquier rol que `role` pueda
 * ver. OR **plano** de `target_role.eq.<rol>` (sin `in.(...)` anidado) para que
 * la sintaxis sea inequívoca.
 *
 * Ej. admin → `user_id.eq.<uid>,target_role.eq.admin,target_role.eq.encargado,target_role.eq.mozo`.
 *
 * ⚠️ `userId` DEBE venir de sesión; los `target_role` son un allowlist fijo.
 * Ver nota de SEGURIDAD en `queries.ts` (DT-007).
 */
export function notificationOrFilter(
  userId: string,
  role: BusinessRole | null,
): string {
  const roleClauses = visibleTargetRoles(role).map((r) => `target_role.eq.${r}`);
  return [`user_id.eq.${userId}`, ...roleClauses].join(",");
}
