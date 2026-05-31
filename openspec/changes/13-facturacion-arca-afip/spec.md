# Spec — 13-facturacion-arca-afip Conectar ARCA (emisión electrónica real por negocio)

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Dinero en **centavos**; scope **business_id + RLS**; secretos **server-only**, jamás expuestos.

## ADDED Requirements

### Requisito: Configurar credenciales fiscales por negocio de forma segura

El sistema DEBE permitir que un **admin** del negocio cargue CUIT, punto de venta y el **secreto del
provider** (apikey/token y, si aplica, referencia al certificado de ARCA) para ese `business_id`,
guardándolos en almacenamiento **server-only**; el secreto NUNCA se devuelve al cliente ni a roles
no-admin.

#### Escenario: Admin carga CUIT, punto de venta y token del provider

- **Dado** un usuario con rol `admin` (o platform admin) en el negocio "House"
- **Cuando** envía el formulario de configuración fiscal con CUIT de 11 dígitos, punto de venta válido
  (1–99999) y el token del provider
- **Entonces** `updateAfipConfig` (`src/lib/afip/config-actions.ts`) valida con Zod, persiste CUIT y
  punto de venta en `businesses.afip_cuit`/`afip_punto_venta` y el token en la columna **server-only**
  del secreto, y responde OK sin incluir el token en la respuesta

#### Escenario: Encargado no puede cargar credenciales fiscales

- **Dado** un usuario con rol `encargado`
- **Cuando** intenta guardar la configuración fiscal del negocio
- **Entonces** la action rechaza con "No tenés permisos para modificar la configuración AFIP."
  (gate `canManageBusiness`) y no se escribe ningún secreto

#### Escenario: La UI nunca expone el secreto cargado

- **Dado** un negocio con token del provider ya cargado
- **Cuando** el admin abre la pantalla de facturación (`src/components/admin/facturacion/`)
- **Entonces** la UI muestra el estado "credenciales cargadas: sí" pero **no** renderiza el valor del
  token (la query de UI selecciona un flag booleano, nunca la columna del secreto)

### Requisito: Resolver el provider con credenciales del negocio (no env global)

El sistema DEBE construir el cliente del provider (`tusfacturas`/`sandbox`) usando las credenciales
resueltas **por `business_id`**, en lugar de leer una apikey de **env global**.

#### Escenario: Emisión usa el token del negocio emisor

- **Dado** dos negocios "House" y "Golf" con tokens de provider distintos
- **Cuando** se emite un comprobante para una orden de "Golf"
- **Entonces** el cliente TusFacturas se construye con el token de **Golf** (resuelto desde su
  `business_id`), no con un valor de env compartido

#### Escenario: Falta credencial de producción

- **Dado** un negocio en modo `producción` sin token de provider cargado
- **Cuando** se intenta emitir
- **Entonces** la emisión falla con un mensaje claro ("Faltan credenciales fiscales del negocio") y
  **no** se llama al provider externo

### Requisito: Operar en sandbox y promover a producción por negocio

El sistema DEBE soportar un **modo fiscal por negocio** (`sandbox` | `producción`). En `sandbox` los
comprobantes se emiten con el provider de prueba (CAEs fake, sin valor fiscal). La promoción a
`producción` es una acción **explícita** del admin y requiere credenciales reales cargadas.

#### Escenario: Negocio nuevo arranca en sandbox

- **Dado** un negocio recién configurado sin promover
- **Cuando** se emite un comprobante
- **Entonces** se usa `createSandboxClient` (`src/lib/afip/sandbox.ts`), el comprobante queda
  `authorized` con CAE de prefijo `SANDBOX-` y `provider_response.sandbox = true`

#### Escenario: Promover a producción exige credenciales reales

- **Dado** un negocio en `sandbox` sin token de provider cargado
- **Cuando** el admin intenta promover a `producción`
- **Entonces** la action bloquea con "Cargá las credenciales reales antes de pasar a producción." y el
  modo permanece en `sandbox`

#### Escenario: En producción se usa el provider real

- **Dado** un negocio en `producción` con CUIT, punto de venta y token cargados
- **Cuando** se emite un comprobante
- **Entonces** se construye `createTusfacturasClient` con el token del negocio y se emite contra el
  endpoint real

### Requisito: Garantizar idempotencia de la emisión

El sistema DEBE evitar que una misma orden genere **dos comprobantes autorizados** y que un **reintento
de red** duplique la emisión, mediante una **clave de idempotencia** persistida por `order_id` + tipo de
comprobante.

#### Escenario: Doble click no duplica comprobante

- **Dado** una orden sin factura
- **Cuando** se dispara `emitInvoice` dos veces seguidas con la misma `idempotency_key`
- **Entonces** se crea **un solo** comprobante `authorized`; la segunda invocación devuelve el
  comprobante ya emitido sin volver a llamar al provider

#### Escenario: Orden ya facturada no se re-emite

- **Dado** una orden con una factura en estado `authorized` (no anulada)
- **Cuando** se intenta `emitInvoice` de nuevo
- **Entonces** la action responde "Esta orden ya tiene una factura autorizada." y no llama al provider

#### Escenario: Reintento reusa el número del intento previo

- **Dado** un intento de emisión que obtuvo número de comprobante del provider pero falló al persistir
- **Cuando** se reintenta con la misma `idempotency_key`
- **Entonces** el reintento **no** pide un número nuevo al provider; respeta la correlatividad por punto
  de venta y la restricción `unique (business_id, tipo_comprobante, punto_venta, numero)`

### Requisito: Clasificar errores del provider y permitir reintento manual

El sistema DEBE distinguir entre **rechazo fiscal definitivo** (no reintentar) y **error transitorio**
de red/HTTP (reintentable), y exponer un reintento manual sólo de comprobantes `failed`, restringido a
admin/encargado.

#### Escenario: Error HTTP transitorio queda reintetable

- **Dado** una emisión que falló por `Tusfacturas HTTP 503`
- **Cuando** el admin abre el comprobante `failed`
- **Entonces** la UI ofrece "Reintentar" y `retryInvoice` (`src/lib/afip/emit-invoice.ts`) re-emite
  contra el provider

#### Escenario: Rechazo fiscal no se reintenta a ciegas

- **Dado** una emisión rechazada por el provider con error de validación fiscal (ej. CUIT receptor
  inválido para factura A)
- **Cuando** el admin abre el comprobante `failed`
- **Entonces** el mensaje indica que es un rechazo de datos (corregir antes de reintentar), no un error
  de red

#### Escenario: El mozo no reintenta facturas

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta `retryInvoice`
- **Entonces** la action rechaza ("Solo admin o encargado pueden reintentar facturas.")

## MODIFIED Requirements

### Requisito: Emitir comprobante electrónico (`emitInvoice`)

Cambia respecto del comportamiento de hoy: `emitInvoice` deja de asumir credenciales globales de env y
pasa a (a) resolver el provider con credenciales **por negocio**, (b) respetar el **modo fiscal**
(sandbox/prod), y (c) aplicar **idempotencia** por `idempotency_key`. Se mantienen: scope `business_id`,
montos en centavos vía `calculateAmounts`, persistencia en `invoices` y `status` resultante
(`authorized`/`failed`).

#### Escenario: Emisión real en producción con token del negocio

- **Dado** "House" en `producción` con CUIT, punto de venta y token cargados, y una orden con
  `total_cents`
- **Cuando** se ejecuta `emitInvoice`
- **Entonces** se separan neto/IVA con `calculateAmounts`, se emite con el token de "House", se persiste
  el comprobante con su CAE y `status='authorized'`, y la `idempotency_key` queda registrada

### Requisito: Configuración fiscal en `businesses` (`updateAfipConfig`)

Cambia respecto de hoy: además de `afip_cuit`, `afip_punto_venta`, `afip_provider`, `afip_default_tipo`
(`0048`), la configuración incorpora el **secreto del provider** (server-only) y el **modo fiscal**
(`afip_mode`/`afip_enabled`). La validación de CUIT (11 dígitos) y punto de venta (1–99999) se mantiene;
el gate sigue siendo `canManageBusiness` (admin/plataforma).

#### Escenario: Guardado completo de config fiscal

- **Dado** un admin en "Golf"
- **Cuando** guarda CUIT, punto de venta, tipo por defecto, token del provider y deja el modo en
  `sandbox`
- **Entonces** se persiste todo (secreto en columna server-only), se revalidan
  `/${slug}/admin/configuracion` y `/${slug}/admin/facturacion`, y la respuesta no incluye el secreto
