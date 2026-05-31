# 13-facturacion-arca-afip — Conectar ARCA (facturación electrónica real, cert + CUIT + punto de venta por negocio)

> Estado: 📋 propuesto · Origen: Reunión §4 (Config/Branding) · §7.18 · §5 (Cosas necesarias) · §6 · §3.1 · Design: sí

## Por qué

La **conexión con ARCA** (ex-AFIP, facturación electrónica) es el **único bloqueante de go-live**
declarado en la reunión: "lo único que se complicó y está en resolución" (§1), "todavía no está porque
no se configuró AFIP; se configura con un **certificado + CUIT + punto de venta** y queda listo.
Mercado Pago es fácil; **ARCA es más complejo pero se hace**" (§7.18). El certificado, el CUIT y el
punto de venta los **provee el cliente al instalar** (§5, tabla de Cosas necesarias).

Hoy ya existe el scaffolding `src/lib/afip` con el provider **TusFacturas**
(`provider.ts`, `tusfacturas.ts`, `emit-invoice.ts`, `sandbox.ts`, `config-actions.ts`,
`calculate-amounts.ts`), la tabla `invoices` y las columnas de config en `businesses`
(`0048_invoices.sql`). El **delta** para dejar la emisión REAL andando es: (1) que las
**credenciales fiscales sean por negocio** y se guarden de forma **segura** (hoy `tusfacturas.ts` lee
`TUSFACTURAS_API_KEY` de **env global**, no por negocio); (2) un switch explícito **sandbox → producción**
por negocio; (3) **idempotencia** real de la emisión (que un reintento o doble click no genere dos
comprobantes); (4) **reintentos** con manejo de errores del provider; (5) preparar la articulación con
**anulación / nota de crédito** (cambio 09).

## Qué cambia

- **Credenciales fiscales por negocio y seguras**: el `apikey`/token de TusFacturas (y, si el provider lo
  requiere, la referencia al **certificado** + clave) dejan de tomarse de env global y se resuelven **por
  `business_id`** desde almacenamiento seguro (columnas server-only en `businesses`, nunca expuestas al
  cliente ni a roles no-admin). El CUIT y el punto de venta ya viven en `businesses`
  (`afip_cuit`, `afip_punto_venta`) — se completa la pantalla de carga.
- **Switch sandbox → producción por negocio**: hoy `afip_provider` admite `sandbox`/`tusfacturas`. Se
  formaliza el flujo: el negocio arranca en `sandbox` (CAEs fake, sin valor fiscal) y el admin lo
  promueve a producción sólo cuando las credenciales reales están cargadas y validadas.
- **Idempotencia de la emisión**: una orden no puede generar dos comprobantes autorizados; un reintento
  de red no duplica. Se refuerza el guard "ya tiene factura autorizada" de `emit-invoice.ts` con una
  **clave de idempotencia** persistida.
- **Reintentos y errores**: `retryInvoice` (ya existe para `failed`) se completa con clasificación de
  errores del provider (rechazo fiscal definitivo vs. error transitorio de red/HTTP) para decidir si
  conviene reintentar.
- **Preparar anulación / nota de crédito**: se deja la interfaz `AFIPProviderClient` lista para el camino
  de NC que especifica el **cambio 09** (no se implementa la UI de anulación acá; se asegura el contrato).

## Alcance

**Incluye:**
- Resolución de credenciales de provider **por negocio** desde almacenamiento seguro en
  `src/lib/afip/tusfacturas.ts` + `provider.ts` (firma que recibe la config del negocio en vez de leer
  env global).
- Carga y **validación segura** de cert/CUIT/punto de venta/token por negocio vía
  `src/lib/afip/config-actions.ts` (`updateAfipConfig` ya valida CUIT de 11 dígitos y PV; se extiende
  para el secreto del provider y el modo sandbox/prod), restringida a admin (`canManageBusiness`).
- Switch **sandbox → producción** por negocio (estado de habilitación fiscal del negocio).
- **Idempotencia** de `emitInvoice` (clave por `order_id` + tipo, persistida) y refuerzo del guard
  anti-duplicado.
- Clasificación de errores y **reintentos** en `retryInvoice` / `tusfacturas.ts`.
- Migración nueva (placeholder `00NN`) para columnas server-only de secreto del provider y modo
  fiscal, con RLS (admin/plataforma, scope `business_id`).
- UI mínima de estado de conexión ARCA en `src/components/admin/facturacion/` (sandbox/prod, "credenciales
  cargadas: sí/no", probar conexión) sin exponer nunca el secreto.

**No incluye (fuera de alcance):**
- **Anular factura / emitir nota de crédito** y **pedido flash**: es el **cambio 09** (acá sólo se deja
  el contrato del provider listo).
- Conexión **directa** a webservices de ARCA (WSAA/WSFEv1) sin intermediario: se mantiene el provider
  **TusFacturas** como camino MVP; `afipsdk`/`direct` quedan como providers futuros tipados pero no
  implementados.
- Generación/almacenamiento del **PDF** del comprobante (la columna `invoices.pdf_url` ya existe; su
  poblado queda fuera).
- Cálculo de percepciones / IIBB / regímenes especiales: se mantiene neto + IVA de
  `calculate-amounts.ts`.
- Cobros con **Mercado Pago** (cambio 03) — ARCA y MP son integraciones separadas.

## Impacto

- **Archivos** (reales): `src/lib/afip/tusfacturas.ts` (credencial por negocio en vez de env),
  `src/lib/afip/provider.ts` (firma del provider), `src/lib/afip/emit-invoice.ts` (idempotencia + guard +
  selección de provider con config del negocio), `src/lib/afip/sandbox.ts` (sin cambios de contrato),
  `src/lib/afip/config-actions.ts` (carga segura de secreto + modo fiscal), `src/lib/afip/types.ts`
  (tipos de config extendida), `src/components/admin/facturacion/facturacion-client.tsx` y
  `invoice-detail-sheet.tsx` (estado de conexión, sin secreto).
- **Datos:** migración nueva `supabase/migrations/00NN_afip_secrets_y_modo.sql` (el número se asigna al
  implementar; la última real es `0051`). Agrega a `businesses` columnas **server-only** para el secreto
  del provider y el modo fiscal (ej. `afip_provider_api_key text`, `afip_provider_cert_ref text`,
  `afip_mode text default 'sandbox'`, `afip_enabled boolean default false`) + columna de **idempotencia**
  en `invoices` (ej. `idempotency_key text` con índice único parcial). RLS: lectura del secreto **sólo**
  service role / admin; nunca `select` de esas columnas para roles no-admin.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts` (nuevas columnas).
- **Permisos:** sin nuevos helpers en `can.ts`; la config fiscal usa `canManageBusiness`
  (`src/lib/admin/context.ts`, sólo admin/plataforma). Emisión sigue gateada por
  `requireMozoActionContext` (mozo+) como hoy.
- **Integraciones:** **ARCA/AFIP vía TusFacturas**. **Secretos**: certificado, CUIT, punto de venta y
  token/apikey del provider — **nunca** en specs, chat ni commits; viven en columnas server-only de
  `businesses` (o storage seguro), enmascarados en cualquier output.

## Riesgos

- **Secreto fiscal expuesto** → guardar token/cert en columnas server-only, jamás devolverlas al cliente
  ni a roles no-admin; las queries de UI seleccionan flags ("hay credencial: sí/no"), nunca el valor.
  RLS niega lectura del secreto fuera de service role/admin.
- **Doble facturación** → un comprobante autorizado es irreversible en AR (sólo se anula con nota de
  crédito). Mitigación: **idempotency_key** persistida + guard "ya autorizada" antes de llamar al
  provider + `unique (business_id, tipo_comprobante, punto_venta, numero)` ya existente en `0048`.
- **Emitir en producción sin querer** → arranque en `sandbox`; promover a `producción` es acción
  explícita de admin y requiere credenciales reales cargadas. El sandbox marca los comprobantes como
  "no válidos fiscalmente".
- **Numeración fuera de orden** → ARCA exige correlatividad por punto de venta; `getLastNumber` del
  provider y el `unique` por (negocio, tipo, PV, número) protegen, pero un reintento debe **reusar** el
  número del intento previo, no pedir uno nuevo (parte de la idempotencia).
- **Error transitorio vs. rechazo fiscal** → no reintentar automáticamente un rechazo definitivo (CUIT
  inválido, comprobante mal formado); sí permitir reintento manual de errores de red/HTTP. Clasificación
  explícita en `tusfacturas.ts`.
- **Dinero en centavos** → todo el comprobante (`total_cents`, `neto_cents`, `iva_cents`) sigue en
  centavos; el provider recibe pesos (`/100`) sólo en el borde de `tusfacturas.ts`, como hoy.

## Preguntas abiertas

- [ ] ¿El provider TusFacturas usa **apikey por negocio** (multi-cuenta bajo una sola apikey con el CUIT
      como discriminador) o requiere **una credencial distinta por CUIT**? Asumimos credencial **por
      negocio** para no acoplar locales; confirmar con TusFacturas al instalar.
- [ ] ¿El **certificado** de ARCA lo consume TusFacturas (se sube en su panel) o lo necesitamos
      almacenar nosotros? Asumimos que TusFacturas lo gestiona; si hay que guardarlo, va a **storage
      seguro** referenciado por `afip_provider_cert_ref` (nunca el binario en la DB en claro).
- [ ] La **clave de idempotencia**: ¿por `order_id` (una factura por orden) o por `order_id` + `tipo`
      (permitir factura + futura NC sobre la misma orden)? Asumimos `order_id` + `tipo` para no chocar
      con el cambio 09.
- [ ] ¿Quién promueve de **sandbox a producción**: el admin del negocio o el equipo de plataforma al
      instalar? Asumimos **admin del negocio** con credenciales validadas; plataforma puede asistir.
- [ ] ¿Se factura **automáticamente** al cobrar o es un paso explícito del mostrador? Acá se respeta el
      disparo actual de `emitInvoice` (explícito desde facturación/cobro); no se cambia ese trigger.
