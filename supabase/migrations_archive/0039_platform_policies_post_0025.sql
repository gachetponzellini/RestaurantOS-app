-- ============================================
-- Platform admin policies: tablas creadas después de la migración 0007
-- ============================================
-- Patrón ya repetido en 0032 (super_categories) y 0033 (stations): cada
-- vez que sumamos una tabla con RLS por `is_business_member`, también hay
-- que sumar el set `platform_*` con `is_platform_admin()` para que el
-- platform admin (que no es miembro de ningún business via business_users)
-- pueda operar.
--
-- Síntoma sin estas policies: queries con sesión del platform admin
-- devuelven vacío (no hay error, solo 0 rows). El admin entra a una
-- pantalla y "no se carga nada" — la causa real es RLS denegando filas.
--
-- Tablas tocadas:
--   - comandas, comanda_items (migración 0025) — el caso que disparó este parche.
--   - tables_audit_log, notifications (0029) — bell del mozo / audit.
--   - order_splits, order_split_items (0035) — Bloque 5 cuenta.
--   - payments (0036) — Bloque 5 cobros.
--   - cajas, caja_turnos, caja_movimientos (0037) — Bloque 5 caja.
--
-- Cada policy es PERMISSIVE por default; Postgres OR-combina con las
-- members_* existentes, así que no hay riesgo de cerrar acceso a miembros.
-- ============================================

-- ── comandas ────────────────────────────────────────────────
create policy "platform_select_comandas" on public.comandas
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_comandas" on public.comandas
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_comandas" on public.comandas
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "platform_delete_comandas" on public.comandas
  for delete to authenticated using (public.is_platform_admin());

-- ── comanda_items ───────────────────────────────────────────
create policy "platform_select_comanda_items" on public.comanda_items
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_comanda_items" on public.comanda_items
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_delete_comanda_items" on public.comanda_items
  for delete to authenticated using (public.is_platform_admin());

-- ── tables_audit_log ────────────────────────────────────────
create policy "platform_select_tables_audit_log" on public.tables_audit_log
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_tables_audit_log" on public.tables_audit_log
  for insert to authenticated with check (public.is_platform_admin());

-- ── notifications ───────────────────────────────────────────
create policy "platform_select_notifications" on public.notifications
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_notifications" on public.notifications
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_notifications" on public.notifications
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ── order_splits ────────────────────────────────────────────
create policy "platform_select_order_splits" on public.order_splits
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_order_splits" on public.order_splits
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_order_splits" on public.order_splits
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "platform_delete_order_splits" on public.order_splits
  for delete to authenticated using (public.is_platform_admin());

-- ── order_split_items ───────────────────────────────────────
create policy "platform_select_order_split_items" on public.order_split_items
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_order_split_items" on public.order_split_items
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_delete_order_split_items" on public.order_split_items
  for delete to authenticated using (public.is_platform_admin());

-- ── payments ────────────────────────────────────────────────
create policy "platform_select_payments" on public.payments
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_payments" on public.payments
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_payments" on public.payments
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ── cajas ───────────────────────────────────────────────────
create policy "platform_select_cajas" on public.cajas
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_cajas" on public.cajas
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_cajas" on public.cajas
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy "platform_delete_cajas" on public.cajas
  for delete to authenticated using (public.is_platform_admin());

-- ── caja_turnos ─────────────────────────────────────────────
create policy "platform_select_caja_turnos" on public.caja_turnos
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_caja_turnos" on public.caja_turnos
  for insert to authenticated with check (public.is_platform_admin());
create policy "platform_update_caja_turnos" on public.caja_turnos
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ── caja_movimientos ────────────────────────────────────────
create policy "platform_select_caja_movimientos" on public.caja_movimientos
  for select to authenticated using (public.is_platform_admin());
create policy "platform_insert_caja_movimientos" on public.caja_movimientos
  for insert to authenticated with check (public.is_platform_admin());
