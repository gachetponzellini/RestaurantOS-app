# Tareas — 13-facturacion-arca-afip Conectar ARCA (emisión real por negocio)

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Secretos: nunca valores en specs/chat/commits; viven en columnas server-only de `businesses`/storage
> seguro. Dinero en centavos. Scope `business_id` + RLS.

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_afip_secrets_y_modo.sql` (el número se asigna al implementar;
      la última real es `0051`):
  - [ ] `businesses`: agregar columnas **server-only** `afip_provider_api_key text`,
        `afip_provider_cert_ref text` (referencia a storage seguro, no el binario en claro),
        `afip_mode text not null default 'sandbox' check (afip_mode in ('sandbox','produccion'))`,
        `afip_enabled boolean not null default false`.
  - [ ] `invoices`: agregar `idempotency_key text` + índice **único parcial**
        `unique (business_id, order_id, tipo_comprobante) where status in ('pending','authorized')`
        (refuerza el guard anti-duplicado).
  - [ ] RLS: las columnas de secreto de `businesses` NO deben ser legibles por roles no-admin. Verificar
        que las policies existentes no permitan `select` del secreto a `is_business_member` no-admin;
        si hace falta, exponer la config vía vista/columnas filtradas. Mantener policies plataforma
        (`is_platform_admin`).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`

## 2. Dominio (TDD)

- [ ] Test (rojo): `src/lib/afip/emit-invoice.test.ts` (nuevo) cubriendo idempotencia:
  - dos `emitInvoice` con misma `idempotency_key` → un solo comprobante `authorized`;
  - orden con factura `authorized` vigente → "ya tiene una factura autorizada";
  - reintento reusa número (no pide uno nuevo al provider).
- [ ] Test (rojo): `src/lib/afip/provider-config.test.ts` (nuevo) — resolución de credenciales por
      negocio: cliente construido con el token del `business_id` correcto; falta credencial en
      `producción` → no llama al provider.
- [ ] Test (rojo): extender `src/lib/afip/calculate-amounts.test.ts` sólo si se toca el split (no
      previsto); en principio se mantiene verde tal cual.
- [ ] Implementar resolución de credenciales por negocio en `src/lib/afip/tusfacturas.ts`
      (`createTusfacturasClient(config)` recibe token/url del negocio en vez de `getEnv()` global) y
      ajustar la interfaz en `src/lib/afip/provider.ts` si cambia la firma.
- [ ] Implementar modo fiscal + selección de provider en `src/lib/afip/emit-invoice.ts`
      (`getProvider` usa `afip_mode`/`afip_enabled` y pasa la config del negocio; `sandbox` cuando no
      está en `producción`).
- [ ] Implementar idempotencia en `emit-invoice.ts` (resolver/registrar `idempotency_key`; chequear
      comprobante existente por `(business_id, order_id, tipo)` antes de llamar al provider; reusar
      número en reintento).
- [ ] Clasificación de errores en `tusfacturas.ts` (HTTP/red transitorio vs. rechazo fiscal definitivo)
      y propagarla a `retryInvoice`.

## 3. Server Actions / config

- [ ] Extender `updateAfipConfig` (`src/lib/afip/config-actions.ts`): aceptar token del provider y modo
      fiscal; validar con Zod; persistir secreto en columna server-only; mantener gate
      `canManageBusiness`. NUNCA devolver el secreto en el `ActionResult`.
- [ ] Acción de promoción `sandbox → producción` (en `config-actions.ts`): bloquear si faltan
      credenciales reales; setear `afip_mode='produccion'`, `afip_enabled=true`.
- [ ] (Opcional) Acción "probar conexión" que llama a `getLastNumber` del provider y devuelve OK/errores
      sin exponer el secreto.

## 4. UI

- [ ] `src/components/admin/facturacion/facturacion-client.tsx`: panel de estado de conexión ARCA
      (modo sandbox/prod, "credenciales cargadas: sí/no", botón promover, botón probar conexión). La
      query de UI selecciona **flags**, nunca el valor del secreto.
- [ ] `src/components/admin/facturacion/invoice-detail-sheet.tsx`: en comprobantes `failed`, mostrar si
      el error es transitorio (ofrecer "Reintentar") o rechazo fiscal (mensaje de corregir datos).

## 5. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde
- [ ] Revisión fresca de archivos tocados — confirmar que **ningún** path de UI/query expone el secreto
      del provider ni el certificado.
- [ ] Confirmar que el sandbox marca los comprobantes como "no válidos fiscalmente" y que producción
      sólo se activa con credenciales reales.
- [ ] Marcar ✅ en `openspec/changes/README.md`
