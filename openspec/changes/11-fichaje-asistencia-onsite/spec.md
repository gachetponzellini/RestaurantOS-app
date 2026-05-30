# Spec — 11-fichaje-asistencia-onsite Fichaje sólo desde las PCs del local + sin propinas

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Reglas transversales: scope **`business_id` + RLS**, mutaciones en Server Actions validadas con Zod,
> **timezone AR** para horarios. Mecanismo recomendado de enforcement: **allowlist de IP/CIDR** por
> negocio (ver proposal · Preguntas abiertas).

## ADDED Requirements

### Requisito: Restringir el fichaje a orígenes autorizados del local

El sistema DEBE rechazar toda fichada (`clockPunch`) cuya request **no provenga de un origen autorizado**
del negocio. El origen se evalúa contra la **allowlist de IP/CIDR** configurada para ese `business_id`. Un
origen no autorizado no registra entrada ni salida en `clock_entries`.

#### Escenario: Fichada válida desde una PC del local

- **Dado** un negocio "House" con la allowlist `192.168.10.0/24`
- **Y** un empleado con PIN correcto que ficha desde una PC cuya IP es `192.168.10.42`
- **Cuando** envía su PIN en la pantalla `/house/fichar`
- **Entonces** la fichada se acepta y se registra entrada/salida en `clock_entries` para el `business_id`
  de "House".

#### Escenario: Fichada bloqueada desde un celular fuera de la red

- **Dado** la misma allowlist `192.168.10.0/24`
- **Y** un empleado que intenta fichar desde su celular con IP pública `200.x.x.x`
- **Cuando** envía un PIN válido
- **Entonces** la fichada se rechaza con un mensaje del tipo "El fichaje sólo está habilitado desde las
  computadoras del local"
- **Y** no se crea ninguna fila en `clock_entries`.

#### Escenario: PIN correcto pero origen no autorizado no filtra identidad

- **Dado** un origen fuera de la allowlist
- **Cuando** se envía un PIN
- **Entonces** el rechazo es por origen, sin confirmar si el PIN existe (no se debe usar el endpoint para
  validar PINs desde afuera).

### Requisito: Configurar la allowlist de orígenes por negocio

El sistema DEBE permitir a un `admin` configurar los **orígenes autorizados** (IP/CIDR) para fichar en su
negocio, scopeado por `business_id` y protegido por RLS, sin afectar a otros negocios.

#### Escenario: El admin agrega el rango de la LAN del local

- **Dado** un `admin` de "House"
- **Cuando** agrega el CIDR `192.168.10.0/24` a la allowlist de fichaje
- **Entonces** queda guardado para el `business_id` de "House"
- **Y** a partir de ese momento las PCs de ese rango pueden fichar.

#### Escenario: Un negocio no ve ni edita la allowlist de otro

- **Dado** la allowlist de "House"
- **Cuando** un `admin` de "Golf" consulta/edita su configuración de fichaje
- **Entonces** sólo ve y modifica la allowlist de "Golf" (RLS por `business_id`).

#### Escenario: Sólo admin puede editar la allowlist

- **Dado** un usuario con rol `encargado` o `mozo`
- **Cuando** intenta modificar la allowlist de orígenes de fichaje
- **Entonces** la action responde error de permiso y no modifica la configuración.

### Requisito: Registrar intentos de fichada bloqueados

El sistema DEBE registrar (auditoría mínima) los **intentos de fichada rechazados por origen no
autorizado**, para diagnóstico on-site, sin exponer el PIN en claro.

#### Escenario: Queda traza de un intento bloqueado

- **Dado** un intento de fichada desde una IP fuera de la allowlist de "House"
- **Cuando** la fichada se rechaza
- **Entonces** se registra un evento con timestamp (timezone AR), `business_id`, IP de origen y PIN
  enmascarado
- **Y** ese evento es consultable por el `admin` para entender por qué alguien no pudo fichar.

## MODIFIED Requirements

### Requisito: El panel de fichaje/asistencia no muestra propinas

El panel de fichaje y las vistas de asistencia del mozo NO DEBEN mostrar ningún dato de propina. Hoy el
panel de fichaje (`src/components/fichar/clock-screen.tsx`, `present-list.tsx`) y la asistencia del mozo se
centran en horas/turnos; se especifica que la propina (modelo `tip_cents` de billing/caja) queda **fuera**
de estas vistas.

#### Escenario: La pantalla de fichaje no expone propina

- **Dado** un empleado que ficha entrada o salida
- **Cuando** ve la pantalla de fichaje y el panel de asistencia
- **Entonces** ve sus horas, turno y presentes, pero **ninguna** cifra de propina.

#### Escenario: La asistencia del mozo no incluye propina

- **Dado** la vista de horas/asistencia del mozo
- **Cuando** se renderiza
- **Entonces** no consulta ni muestra `tip_cents` ni totales de propina (eso vive en cobro/analítica,
  cambios 06/16).

## REMOVED Requirements

### Requisito: Fichaje desde cualquier dispositivo con la URL y el PIN

Se elimina la posibilidad de fichar desde **dispositivos personales fuera de la red del local**. Antes,
cualquier request a `/[business_slug]/fichar` con un PIN válido registraba la fichada sin importar el
origen; ahora el origen debe estar en la allowlist del negocio (decisión §6 / §7.11).

#### Escenario: Ya no se puede fichar desde casa

- **Dado** un empleado en su casa con la URL de fichaje y su PIN
- **Cuando** intenta fichar
- **Entonces** el sistema lo rechaza por origen no autorizado (comportamiento que antes sí permitía la
  fichada).
