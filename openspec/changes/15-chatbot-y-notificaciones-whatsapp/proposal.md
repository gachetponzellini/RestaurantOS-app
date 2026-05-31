# 15-chatbot-y-notificaciones-whatsapp — Configurar la API key del chatbot y notificaciones WhatsApp configurables (incl. estados de delivery)

> Estado: 📋 propuesto · Origen: Reunión §3.1 (Accionables · equipo dev) · §7.15 (Chatbot) · §7.16 (Notificaciones/WhatsApp) · §7.9 (Delivery y notificaciones al cliente) · §4 (Estados de pedido / Delivery) · Design: no

## Por qué

Tres cosas quedaron rotas o a medias en la demo y todas giran alrededor de **Anthropic + WhatsApp**:

1. **El chatbot de reservas no respondía** porque **falta cargar la API key de Anthropic** (§3.1, §7.15:
   "la reserva por bot no funcionó porque falta cargar la API key"). Hoy el agente
   (`src/lib/chatbot/agent.ts:1546`) lee `ANTHROPIC_API_KEY` **del entorno global** vía el wrapper de
   LangChain (`ChatAnthropic`), sin configuración por negocio ni forma de saber, desde el panel, si el bot
   está **configurado vs no**. En un deploy multi-tenant on-site duplicado (House/Golf) esto deja al
   encargado sin diagnóstico: el bot "no anda" y no hay señal de por qué.
2. **El dueño no quiere recibir todas las notificaciones** (§7.16: "no quiere recibir todos los mensajes
   de todo: debe ser configurable quién recibe qué"). Hoy las notifs son **in-app** (`notifications`,
   `0029`/`0040`) y se dirigen por `user_id` o `target_role` **hardcodeado en cada `createNotification(...)`**
   (`src/lib/mozo/actions.ts`, `src/lib/comandas/actions.ts`): no hay tabla de **preferencias** por tipo de
   evento y destinatario, ni canal **WhatsApp**.
3. **Cada cambio de estado de delivery debería disparar un WhatsApp al cliente** (§7.9: "nuevo → preparando
   → listo → en camino → entregado. Cada cambio de estado dispara un mensaje de WhatsApp al cliente"). Hoy
   `updateOrderStatus` (`src/lib/orders/update-status.ts`) cambia el estado y revalida, pero **no notifica al
   cliente** por ningún canal. El estado "nuevo" es cuando el cliente cargó el pedido desde el celu y **el
   bot ya respondió** que lo toma.

Decisión transversal de la reunión (§6, project.md §6): **notificaciones configurables**. Este cambio
modela la **configuración** (key de Anthropic, credenciales de WhatsApp, preferencias por evento/rol) y el
**disparo de WhatsApp** en los puntos que ya existen — **sin** guardar nunca el valor de ningún secreto en
specs (se referencia su ubicación: env y/o columnas de `businesses`/`chatbot_configs`, siguiendo el patrón
de los secretos de Mercado Pago `mp_*` de `0011` y los de AFIP `afip_*` de `0048`).

## Qué cambia

- **Estado de configuración del chatbot (key de Anthropic), por negocio**: el panel del chatbot expone si
  el bot está **listo para responder** o **falta configurar la key**, sin exponer el valor. Se modela
  dónde vive la credencial (env global y/o `chatbot_configs` — la migración `0013` ya anticipa que esa
  tabla "crecerá para guardar credenciales de WhatsApp, overrides de modelo, flags de enable") y un flag
  `chatbot_enabled` por negocio. El `agent.ts` y `api/chatbot/test` chequean ese estado antes de invocar al
  modelo y devuelven un error **claro** ("falta API key") en vez de un 500 opaco.
- **Preferencias de notificación configurables** (`notification_preferences`): por **tipo de evento**
  (`order.pending`, `mesa.transferred`, `mesa.cancelled`, `comanda.entregada`, `delivery.status`, …),
  **destinatario** (rol o usuario) y **canal** (`in_app` / `whatsapp`). El dueño elige qué recibir y por
  dónde. `createNotification(...)` deja de asumir destinatario fijo y **consulta las preferencias** para
  decidir a quién y por qué canal entregar.
- **Canal WhatsApp para notificaciones del negocio** (encargado/dueño): cuando una preferencia marca
  `whatsapp`, la notif se **encola para envío** por WhatsApp además (o en lugar) del feed in-app. El
  envío real depende de la **cuenta de Meta por local** (credenciales referenciadas, no incluidas); con el
  patrón de "stub hasta conectar Meta" que ya usa Campañas (`src/lib/campaigns/channels.ts`: `wabaChannel`
  rechaza hasta conectar la cuenta).
- **WhatsApp al cliente en cada cambio de estado de delivery**: `updateOrderStatus` (y/o `persist-order` en
  el alta) dispara un mensaje al **teléfono del cliente** en las transiciones `confirmed`(="nuevo, el bot lo
  tomó") `→ preparing` `→ ready` `→ on_the_way` `→ delivered`, con **plantillas configurables** por estado y
  respetando el **tipo** (take-away: salta `on_the_way`; delivery: incluye "en camino"), según el flujo de
  `src/lib/orders/status.ts`.

## Alcance

**Incluye:**
- **Estado "configurado vs no" del chatbot** por negocio + flag `chatbot_enabled`; chequeo previo en
  `agent.ts`/`api/chatbot/test` con error legible; UI de estado en `chatbot-panel.tsx`.
- Tabla **`notification_preferences`** (evento × destinatario × canal) con RLS por `business_id`, sus
  Server Actions de gestión y defaults razonables (back-compat con el comportamiento actual).
- Refactor de `createNotification(...)` para **resolver destinatarios y canales desde las preferencias**
  (en lugar de `target_role`/`user_id` fijos en el call-site).
- **Cola/registro de salida WhatsApp** (`whatsapp_outbox` o equivalente) para notifs del negocio y para
  mensajes al cliente por estado de delivery, con `status` (pending/sent/failed) y referencia al recurso.
- **Plantillas de mensaje por estado de delivery** (configurables, con placeholders) y disparo en
  `updateOrderStatus`, respetando tipo (take-away vs delivery) y timezone AR para horarios.
- Referencia (no valor) a **dónde se configuran** key de Anthropic y credenciales de WhatsApp/Meta por
  negocio, siguiendo el patrón `mp_*` (`0011`) / `afip_*` (`0048`).

**No incluye (fuera de alcance):**
- **Conectar la cuenta de Meta / WhatsApp Business API end-to-end** (alta de número, verificación, plantillas
  aprobadas por Meta): es trabajo operativo de §3.1/§7.23 ("arrancar Meta el lunes") y del cambio **14**
  (multi-local/Meta por local). Acá se deja el **canal y la cola** listos con stub, como Campañas.
- **El valor de ningún secreto** (API key de Anthropic, tokens de WhatsApp/Meta): jamás en specs/commits;
  sólo se modela la **ubicación, validación y estado**.
- **Editar el prompt/herramientas del chatbot**: ya existe (`api/chatbot/config`, `chatbot-prompt-editor.tsx`,
  `0015`/`0016`); este cambio no lo toca salvo el bloque de **estado de la key**.
- **Mensajería bidireccional del bot por WhatsApp real** (webhook entrante de Meta): el agente ya corre por
  `channel: "web-test"`; el canal WhatsApp productivo entrante queda con el cableado de Meta del cambio 14.
- **Cambios en la máquina de estados de pedido**: el colapso de estados y el auto-march son del cambio **05**;
  acá sólo se **engancha** el WhatsApp a las transiciones existentes de `status.ts`.

## Impacto

- **Archivos** (reales):
  - `src/lib/chatbot/agent.ts` — chequeo de "key/enabled configurado" antes de instanciar `ChatAnthropic`;
    error legible si falta (hoy lee `ANTHROPIC_API_KEY` de env en `agent.ts:1546`, modelo en `:158`).
  - `src/app/api/chatbot/test/route.ts` — propagar el error "falta API key" como mensaje claro (hoy cae a
    500 genérico). `src/app/api/chatbot/config/route.ts` — exponer `chatbotReady`/`enabled` en el GET.
  - `src/components/admin/chatbot-panel.tsx` (+ `chatbot-prompt-editor.tsx`/`chatbot-tester.tsx`) — badge de
    estado "Listo / Falta configurar la API key".
  - `src/lib/notifications/create.ts` — resolver destinatarios + canales desde `notification_preferences`.
  - `src/lib/notifications/actions.ts` (+ nuevo módulo de preferencias y de outbox WhatsApp) — gestión de
    preferencias (Zod + permisos) y encolado de salida.
  - `src/lib/orders/update-status.ts` — disparar WhatsApp al cliente por transición de delivery;
    plantillas en `src/lib/notifications/<delivery-templates>.ts` (lógica pura testeable).
  - `src/components/notifications/*` y/o `src/components/admin/settings/*` — UI de preferencias del dueño.
  - Callers de `createNotification` (`src/lib/mozo/actions.ts`, `src/lib/comandas/actions.ts`) — quedan
    igual en intención; el ruteo fino se mueve a `create.ts`.
- **Datos:** nueva migración `supabase/migrations/00NN_notification_prefs_y_whatsapp.sql` (número definitivo
  al implementar; última real `0051`). Crea:
  - `notification_preferences (id, business_id, event_type, target_role|target_user_id, channel, enabled, …)`
    con unicidad por `(business_id, event_type, destinatario, channel)` + RLS por `business_id`.
  - `whatsapp_outbox (id, business_id, to_phone, body, kind, ref_id, status, error, created_at, sent_at)`
    (o equivalente) + RLS por `business_id`.
  - `alter table chatbot_configs add column chatbot_enabled boolean not null default false` (+ columnas de
    **referencia** a credenciales de WhatsApp por negocio si se decide guardarlas acá en vez de env, sin
    valores). Posibles columnas `whatsapp_*` siguiendo el patrón `mp_*` de `0011`.
  - Plantillas de mensaje por estado de delivery: columnas/JSON en `chatbot_configs` o tabla
    `delivery_message_templates` (a decidir en tasks).
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** gestionar preferencias y plantillas → `admin`/`encargado` (`src/lib/permissions/can.ts`); el
  estado del chatbot/key lo ve quien ya accede al panel (`ensureAdminAccess`).
- **Integraciones:** **Anthropic** (estado/validación de la key, sin valor) · **WhatsApp/Meta** (canal +
  cola con stub hasta conectar la cuenta del cambio 14) · NO toca Mercado Pago ni AFIP.

## Riesgos

- **Secretos** → ni la key de Anthropic ni los tokens de WhatsApp se escriben en specs ni se loguean. Se
  modela ubicación (env / `chatbot_configs`/`businesses`) y **estado** (`configurado`/`no`). El masking al
  pedir output es obligatorio (AGENTS.md §7).
- **Envío masivo / costo de WhatsApp** → un cambio de estado por pedido puede generar muchos mensajes; el
  **outbox** desacopla el disparo del envío y permite rate-limit/retry. Sin cuenta de Meta conectada, el
  canal queda en **stub** (no falla el flujo del pedido si WhatsApp no está listo: best-effort, como hoy
  `createNotification` que loguea y sigue).
- **Doble notificación** → con preferencias `in_app` + `whatsapp` por el mismo evento, evitar duplicar al
  mismo destinatario en el mismo canal (unicidad en `notification_preferences`).
- **Back-compat** → hoy varios `createNotification` asumen `target_role`. Los defaults de
  `notification_preferences` deben **reproducir el comportamiento actual** para no perder avisos al migrar.
- **Multi-tenant** → toda preferencia/outbox por `business_id` + RLS; House y Golf tienen su propia config
  de notificaciones y su propia cuenta de WhatsApp (cambio 14).
- **Timezone AR** → los textos al cliente con horarios/ETA usan `date-fns-tz`, nunca `Date` naïve.
- **Tipo de pedido** → take-away no tiene "en camino"; el disparo debe respetar `delivery_type` para no
  mandar "tu pedido salió" a un retiro en local.

## Preguntas abiertas

- [ ] **¿Dónde vive la API key de Anthropic?** ¿Env global `ANTHROPIC_API_KEY` (hoy) con sólo un flag
      `chatbot_enabled` por negocio, o por negocio en `chatbot_configs` (encriptada)? Propuesta: env por
      deploy on-site (House/Golf están duplicados) + flag/estado por negocio. Nunca el valor en specs.
- [ ] **¿Las credenciales de WhatsApp van en `businesses`/`chatbot_configs` o en env del agente on-site?**
      Propuesta: por negocio (cada local su número/cuenta de Meta — §7.23), siguiendo el patrón `mp_*`.
- [ ] **Granularidad de las preferencias**: ¿por rol alcanza, o el dueño quiere por **usuario** puntual?
      Propuesta: soportar ambos (`target_role` o `target_user_id`), con rol como default.
- [ ] **¿Qué eventos son notificables y cuáles activos por default?** (hoy existen `order.pending`,
      `mesa.transferred`, `mesa.cancelled`, `comanda.entregada`). Falta acordar el set inicial y sus
      defaults para no romper el comportamiento actual.
- [ ] **Plantillas de delivery**: ¿editables por el dueño desde el panel o fijas con placeholders? ¿Una por
      estado? Propuesta: editables, una por estado, con placeholders (`{cliente}`, `{numero}`, `{eta}`).
- [ ] **¿El "nuevo" del cliente** (alta del pedido + respuesta del bot) cuenta como una notificación de
      WhatsApp aparte, o es la confirmación que ya da el bot? Propuesta: es la respuesta del bot (no se
      duplica); el primer WhatsApp de estado es `preparing`.
