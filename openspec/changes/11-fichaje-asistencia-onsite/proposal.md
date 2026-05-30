# 11-fichaje-asistencia-onsite — Fichaje sólo desde las PCs del local + sin propinas en el panel

> Estado: 📋 propuesto · Origen: Reunión §4 (Panel · Fichaje) · §7.11 (Fichaje / asistencia) · §6 (Decisiones tomadas) · Design: no

## Por qué

Hoy el fichaje es abierto: la pantalla `src/app/[business_slug]/fichar/page.tsx` (componente
`src/components/fichar/clock-screen.tsx`) toma un PIN de 4 dígitos y la Server Action `clockPunch`
(`src/lib/rrhh/clock-actions.ts`) registra entrada/salida en `clock_entries` (migración `0045`) **sin
restringir el origen**: cualquiera con la URL y el PIN puede fichar desde su celular.

La reunión dejó **dos decisiones tomadas** (§6 y §7.11):

1. **Fichaje sólo desde las computadoras del local**, no desde dispositivos personales. Como cada empleado
   "no puede trabajar sin el sistema", fichando desde la PC del local **el fichaje queda asegurado** y no
   se puede marcar desde casa. Es **deploy on-site** (servidor local + red del negocio), lo que habilita
   un enforcement por **red/IP** o por **binding de dispositivo**.
2. **Sacar las propinas de este panel**: el panel de fichaje/mozo no debe mostrar propinas; se manejan
   por otro lado (regla transversal: la propina queda fuera de métricas — cambios 06/16).

Este cambio formaliza el **enforcement de origen** del fichaje y la **ausencia de propinas** en el panel
de fichaje/asistencia. Es un refinamiento sobre `0045` + `clock-actions.ts`, no un módulo nuevo.

## Qué cambia

- **Enforcement de origen del fichaje**: `clockPunch` (y la ruta `/fichar`) sólo aceptan una fichada si la
  request proviene de un **origen autorizado del local**. Mecanismo recomendado (ver Preguntas abiertas):
  **allowlist de IP/CIDR de la red local del negocio**, configurada por negocio, comparada contra la IP
  de la request (`x-forwarded-for` detrás del proxy on-site). Alternativa secundaria: **token de
  dispositivo** persistido en la PC del local. Si el origen no está autorizado → la fichada se rechaza con
  mensaje claro y queda registrada como intento bloqueado (auditoría).
- **Configuración por negocio del origen permitido**: lista de IPs/CIDR (o tokens de dispositivo)
  habilitados para fichar, scopeada por `business_id` y bajo RLS, editable por `admin`.
- **Sin propinas en el panel de fichaje/asistencia**: se garantiza por especificación que el panel de
  fichaje (`clock-screen.tsx`, `present-list.tsx`) y las vistas de asistencia del mozo no exponen ningún
  dato de propina. (El modelo de propina vive en billing/caja —`tip_cents`—; acá sólo se asegura que el
  panel de fichaje no lo muestre.)

## Alcance

**Incluye:**
- Validación de **origen autorizado** en `clockPunch` y en la entrada de la ruta `/fichar`.
- Configuración por negocio de la **allowlist de IP/CIDR** (mecanismo recomendado) con su RLS.
- Registro de **intentos de fichada bloqueados** (auditoría mínima) para diagnóstico on-site.
- Garantía de que el **panel de fichaje/asistencia no muestra propinas**.

**No incluye (fuera de alcance):**
- El **modelo de propina** y su exclusión de métricas/dashboards de caja y analítica: cambios
  **06 (cobro-y-propina)** y **16 (campañas-y-analitica)**. Acá sólo se afirma que el panel de fichaje no
  la muestra.
- **Liquidación de horas / RRHH analítico** (`src/lib/rrhh/clock-queries.ts`, `src/components/admin/rrhh/`):
  sin cambios de comportamiento; se mantienen como hoy.
- **VPN / certificados de dispositivo** avanzados: el binding por token de dispositivo queda como
  alternativa documentada, no como entrega de este cambio salvo que el cliente lo pida.
- Cambiar el mecanismo de **PIN** de fichada: se mantiene (`0045`).

## Impacto

- **Archivos** (reales):
  - `src/lib/rrhh/clock-actions.ts` (`clockPunch`: chequeo de origen autorizado antes de insertar en
    `clock_entries`; `getCurrentPresent` sin cambios).
  - `src/app/[business_slug]/fichar/page.tsx` (pasar/validar el origen; mostrar bloqueo si no autorizado).
  - `src/components/fichar/clock-screen.tsx` y `present-list.tsx` (mensaje de origen no autorizado;
    confirmar que no renderizan propinas).
  - Lógica pura nueva para evaluar IP∈CIDR (testeable) en `src/lib/rrhh/`.
  - Configuración de allowlist: nueva área en `src/components/admin/settings/` o `src/components/admin/rrhh/`
    (form de IPs/CIDR por negocio).
- **Datos:** nueva migración `supabase/migrations/00NN_fichaje_origen_allowlist.sql` (número definitivo al
  implementar; última real `0051`). Agrega config de **orígenes autorizados** por negocio — opciones:
  columna `clock_allowed_cidrs text[]` en `businesses`, **o** tabla `clock_allowed_origins (business_id,
  cidr, label, …)` con RLS `members`/`platform`. Opcional: tabla/columna para **intentos bloqueados**
  (auditoría). Scope `business_id` + RLS en todo lo nuevo.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** la configuración de la allowlist la edita `admin` (alinear con `canManageCajas`-style en
  `src/lib/permissions/can.ts`; agregar `canManageFichajeOrigen` si se decide centralizar). La fichada en
  sí sigue siendo por PIN (no requiere login del empleado).
- **Integraciones:** n/a. Depende del **deploy on-site**: el proxy local debe propagar la IP real del
  cliente (`x-forwarded-for`) para que la allowlist funcione (cambio **14 multi-local-y-deploy-onsite**).

## Riesgos

- **IP detrás de proxy/NAT** → si el reverse-proxy on-site no propaga `x-forwarded-for`, todas las
  requests llegan con la IP del proxy y la allowlist no discrimina. Mitigación: documentar la config del
  proxy en el cambio 14; permitir CIDR de la LAN del negocio; fallback a token de dispositivo.
- **Bloqueo legítimo** (la PC del local cambia de IP por DHCP) → usar **rangos CIDR** de la LAN, no IPs
  sueltas; permitir varias entradas por negocio.
- **Falsos negativos dejan sin fichar al personal** → el rechazo debe ser claro y el `admin` debe poder
  agregar el origen al instante; registrar intentos bloqueados para diagnosticar.
- **Multi-tenant** → la allowlist es **por `business_id`** (House y Golf tienen redes distintas); RLS
  evita que un negocio vea/edite los orígenes de otro.
- **Propina filtrándose al panel** → se cubre con revisión de los componentes de fichaje; no se agrega
  ninguna query de `tip_cents` al panel de fichaje.

## Preguntas abiertas

- [ ] **Mecanismo de enforcement (recomendado):** allowlist de **IP/CIDR de la LAN del negocio** validada
      contra `x-forwarded-for`. ¿El cliente prefiere esto o **binding de dispositivo** (token persistido en
      la PC del local)? Propuesta: arrancar con IP/CIDR (más simple on-site) y dejar el token como refuerzo
      opcional.
- [ ] ¿La allowlist se guarda como `businesses.clock_allowed_cidrs` (simple) o como tabla
      `clock_allowed_origins` (varias entradas con label/auditoría)? Propuesta: tabla, para escalar a varias
      PCs y registrar quién la cambió.
- [ ] ¿Se registran los **intentos de fichada bloqueados**? Propuesta: sí, mínimo (timestamp, IP, PIN
      enmascarado) para diagnóstico on-site.
- [ ] Confirmar con infra (cambio 14) que el **proxy on-site propaga la IP real** del cliente; sin eso, la
      allowlist por IP no es efectiva.
