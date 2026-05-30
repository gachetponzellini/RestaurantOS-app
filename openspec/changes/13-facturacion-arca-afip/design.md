# Design — 13-facturacion-arca-afip Conectar ARCA (emisión electrónica real por negocio)

## Contexto y problema

Este cambio dispara dos gates de diseño: **toca dinero real** (facturación ARCA) y **maneja secretos
sensibles por negocio** (certificado, CUIT, punto de venta, token del provider). Es además el
**bloqueante de go-live** (§1, §7.18).

El módulo `src/lib/afip` ya existe y funciona contra el **sandbox**, pero tiene un gap concreto para
emitir en **producción multi-tenant**:

- `src/lib/afip/tusfacturas.ts` lee `TUSFACTURAS_API_KEY` de **env global** (`getEnv()`), lo que implica
  **una sola credencial para todos los negocios**. House y Golf tienen CUIT y punto de venta distintos
  (y posiblemente cuentas de provider distintas): la credencial debe resolverse **por `business_id`**.
- `src/lib/afip/emit-invoice.ts` carga `afip_cuit`, `afip_punto_venta`, `afip_provider`,
  `afip_default_tipo` desde `businesses` (`0048`), pero el **secreto** del provider no vive ahí.
- La idempotencia hoy es sólo el guard "ya tiene factura `authorized`" (`emit-invoice.ts` L97-105). No
  hay clave que cubra el caso "el provider autorizó pero falló el insert" ni el doble click.
- El switch sandbox/prod es implícito en `afip_provider` (`sandbox` vs `tusfacturas`), sin un estado de
  habilitación fiscal explícito.

Un comprobante autorizado en AR es **irreversible** (sólo se neutraliza con nota de crédito, cambio 09):
duplicar o emitir en producción por error tiene costo fiscal real. El diseño prioriza **no duplicar** y
**no filtrar secretos**.

## Opciones consideradas

### Provider / credenciales

1. **Mantener apikey en env global (status quo).**
   - Pros: cero migración; ya está.
   - Contras: no soporta multi-tenant real; un negocio podría emitir con la cuenta de otro; bloquea
     go-live de dos locales. Inaceptable.

2. **Guardar el secreto del provider en columnas server-only de `businesses` + RLS.** *(elegida)*
   - Pros: reusa el patrón ya probado para **Mercado Pago** (`businesses.mp_access_token` /
     `mp_webhook_secret`, ver `src/app/api/mp/webhook/route.ts` y `src/lib/payments/reconcile.ts`); el
     service role lee el secreto, los clientes nunca; un solo lugar por negocio.
   - Contras: hay que asegurar que ninguna query de UI seleccione esas columnas; deuda de disciplina.

3. **Secreto en un secret manager externo (Vault/SSM) referenciado por id.**
   - Pros: máxima seguridad; rotación centralizada.
   - Contras: sobre-ingeniería para deploy **on-site** de dos locales; agrega infra y dependencia
     operativa que el equipo no tiene hoy. Se deja como evolución futura (la columna `cert_ref` ya
     admite apuntar a storage seguro si hiciera falta para el certificado).

### Idempotencia

1. **Sólo el guard "ya authorized" (status quo).** — No cubre "autorizó pero no persistió". Insuficiente.
2. **`idempotency_key` persistida por `order_id` + tipo + índice único parcial.** *(elegida)* — Cubre
   doble click y reintento; barata; se apoya en el `unique (business_id, tipo, PV, numero)` ya existente
   en `0048`.
3. **Lock distribuido (Redis/Upstash).** — El repo usa Upstash sólo opcional para rate-limit de
   `createOrder`; depender de él para algo fiscal lo vuelve un punto de falla. Descartado.

## Decisión

- **Credenciales por negocio (Opción 2)**: el secreto del provider vive en `businesses` en columnas
  **server-only** (`afip_provider_api_key`, `afip_provider_cert_ref`), igual que MP. `tusfacturas.ts`
  pasa a recibir la config del negocio (`createTusfacturasClient(config)`) en vez de `getEnv()`.
  `emit-invoice.ts` resuelve la config (CUIT, PV, secreto, modo) por `business_id` y la inyecta al
  provider.
- **Modo fiscal explícito**: `afip_mode ('sandbox'|'produccion')` + `afip_enabled boolean`. El selector
  de provider en `emit-invoice.ts` usa `sandbox` salvo que el negocio esté en `produccion` con
  credenciales reales. Promover es acción de admin que valida credenciales.
- **Idempotencia (Opción 2)**: `invoices.idempotency_key` + índice único parcial por
  `(business_id, order_id, tipo_comprobante) where status in ('pending','authorized')`. Antes de llamar
  al provider se chequea comprobante existente; un reintento reusa el número del intento previo.
- **Contrato de NC listo, sin implementar**: se respeta `AFIPProviderClient` (`emit` + `getLastNumber`)
  para que el cambio **09** (anulación/nota de crédito) agregue su camino sin tocar el contrato.

## Impacto técnico

- **Máquina de estados del comprobante (`invoices.status`, sin cambios de enum — ya en `0048`):**

  ```
  (no existe) --emitInvoice OK--> authorized
              --emitInvoice provider error--> failed --retryInvoice OK--> authorized
                                                      --retryInvoice error--> failed
  authorized --[cambio 09: nota de crédito]--> cancelled   (fuera de alcance acá)
  pending  (reservado por idempotencia: número tomado, persistencia en curso)
  ```
  Acá se agrega el manejo de `pending`/idempotencia y la clasificación de `failed`
  (transitorio vs. fiscal). No se agregan valores al enum.

- **Modo fiscal del negocio (nuevo, en `businesses`):**

  ```
  sandbox (default) --[admin promueve, credenciales reales OK]--> produccion
  produccion --------[admin revierte / problema]----------------> sandbox
  ```

- **Datos:** migración nueva `00NN_afip_secrets_y_modo.sql` (número al implementar; última real `0051`):
  - `businesses`: `afip_provider_api_key text` (server-only), `afip_provider_cert_ref text` (ref a
    storage seguro), `afip_mode text default 'sandbox'`, `afip_enabled boolean default false`.
  - `invoices`: `idempotency_key text` + índice único parcial anti-duplicado.
  - RLS: el secreto **no** se expone a roles no-admin; lectura del valor sólo por service role/admin.
    Las policies de `invoices` de `0048` (members select/insert/update + platform) se mantienen.

- **Contratos entre módulos:**
  - `emit-invoice.ts` (orquestador) **resuelve** config por `business_id` desde `businesses` y **llama**
    al provider (`tusfacturas.ts` o `sandbox.ts`) con esa config. **Único** punto que toca el provider
    real.
  - `config-actions.ts` (`updateAfipConfig` + promover) **escribe** el secreto y el modo; gate
    `canManageBusiness` (`src/lib/admin/context.ts`).
  - `calculate-amounts.ts` se mantiene como única fuente del split neto/IVA (centavos).
  - El **cambio 09** consumirá `AFIPProviderClient` para la NC; este cambio no implementa ese camino,
    sólo deja la interfaz y el modo/credenciales por negocio listos.

- **Multi-tenant / RLS:** toda la emisión usa el `business_id` del negocio emisor (resuelto vía
  `getBusiness(slug)` + `requireMozoActionContext`). El `unique (business_id, tipo, PV, numero)` de
  `0048` y la idempotencia por negocio garantizan que un negocio no afecte la numeración de otro. El
  secreto es por negocio; nada cruza tenants.

## Trade-offs y consecuencias

- **Disciplina sobre el secreto**: la seguridad depende de que **ninguna** query de UI seleccione las
  columnas del token/cert. Se documenta y se verifica en la revisión fresca (tasks §5). Mitigación
  futura: vista filtrada o secret manager (Opción 3) si se escala más allá de on-site.
- **Provider único (TusFacturas)**: no se implementa conexión directa a WSAA/WSFEv1. Es deuda
  consciente — TusFacturas resuelve el certificado y la complejidad de los webservices, alineado con
  "ARCA es más complejo pero se hace" (§7.18). `afipsdk`/`direct` quedan tipados para el futuro.
- **Idempotencia por `order_id` + tipo**: habilita factura + futura NC sobre la misma orden (cambio 09)
  sin chocar, pero asume "una factura vigente por orden". Si el negocio necesitara varias facturas por
  orden, habría que revisar la clave (poco probable en el dominio).
- **Plan de reversión**: la migración es **aditiva** (columnas nuevas con defaults; índice único
  parcial). Revertir el comportamiento es volver `getProvider` a env global y dejar el modo en
  `sandbox`; las columnas quedan sin uso, sin pérdida de datos. Un negocio en `produccion` con
  comprobantes reales emitidos **no** se revierte (los comprobantes ya existen en ARCA).
