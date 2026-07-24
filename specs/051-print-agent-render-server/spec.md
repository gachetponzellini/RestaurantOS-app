# Feature Specification: Renderizado del ticket en el servidor (print-agent como relay)

**Feature Branch**: `051-print-agent-render-server`

**Created**: 2026-07-20

**Status**: Propuesto — plan cerrado (ver [`plan.md`](plan.md)). **Fase 1**: desacople con paridad 58mm, sin config de ancho, **sin migración**. Milestone: Post-demo · Growth & hardening. Issue [#85](https://github.com/gachetponzellini/RestaurantOS-app/issues/85). **Habilita** el spec [057](../057-avisos-a-comanderas/) (avisos a comanderas). Decisión de alcance (Juan, 2026-07-23): se prioriza este desacople antes que 057 para no volver a tocar el `.exe` por formato.

**Input**: User description: "Desacoplar el print-agent: mover la lógica de renderizado del ticket (qué imprimir) del .exe al backend. El agente pasa a ser un relay tonto que solo transporta bytes a la impresora, para que los cambios de formato sean solo deploy en Vercel, sin rebuild ni re-descarga del .exe."

## Contexto y problema

Hoy la lógica de **qué imprimir** (layout, tamaños de letra, códigos ESC/POS) vive **dentro del ejecutable** del print-agent (`ticketLines` + `renderEscPos` + `renderPlain` en `print-agent/agent.mjs`). El servidor (`GET /api/print-agent`, spec 28) solo entrega **datos estructurados** de la comanda (sector, ítems, `cancelled`, `reprint`, …) y el agente decide el formato final.

Consecuencia: **cada cambio de formato del ticket obliga a recompilar el `.exe` (pkg), resubirlo al bucket `print-agent-releases` (spec 046) y re-descargarlo en cada PC del local**. En la última semana esto pasó tres veces seguidas (letra grande, ancho +30%, marca de reimpresión), cada una con su ronda de rebuild + subida + re-descarga en golf. Es lento, frágil y no escala a más locales.

El renderizado además **no es testeable en el repo**: al vivir en un `.mjs` suelto que auto-arranca, hoy solo se valida con harnests copy-paste — señal de que la lógica está en el lugar equivocado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cambiar el formato del ticket sin tocar el agente (Priority: P1)

El equipo necesita ajustar cómo se imprime la comanda (tamaño de letra, agregar un dato, una marca nueva) y que ese cambio llegue a la impresora del local **sin** recompilar ni redistribuir el ejecutable.

**Why this priority**: Es el objetivo central de la feature. Elimina el ciclo caro rebuild → subir → re-descargar que hoy bloquea cada iteración de formato y no escala a múltiples locales.

**Independent Test**: Con el agente relay ya instalado en el local, cambiar el renderizado en el servidor y desplegar; la **siguiente comanda** que imprime el local refleja el cambio, sin haber tocado el ejecutable ni descargado nada nuevo.

**Acceptance Scenarios**:

1. **Given** un local con el agente relay corriendo, **When** el equipo cambia el formato del ticket en el servidor y despliega, **Then** la próxima comanda impresa refleja el cambio sin rebuild ni re-descarga del ejecutable.
2. **Given** el mismo local, **When** se marcha una comanda, **Then** el ticket impreso es equivalente (o mejor) al que producía el agente con su lógica embebida, para todos los tipos de comanda existentes (normal, anulada, reimpresión, sin ítems).

---

### User Story 2 - Migración sin romper lo que ya imprime (Priority: P2)

Golf ya tiene un agente instalado imprimiendo en producción. La transición al modelo relay no puede cortar la impresión ni exigir un cambio coordinado y simultáneo de servidor + ejecutable.

**Why this priority**: Sin retrocompatibilidad, el desacople sería un big-bang riesgoso sobre un local en producción. La feature tiene que poder convivir con el agente actual durante la migración.

**Independent Test**: Con el **agente actual** (el que formatea localmente) apuntando al servidor nuevo, las comandas se siguen imprimiendo igual; y con el **agente relay** nuevo apuntando al servidor nuevo, se imprime con el render del servidor. Ninguna de las dos combinaciones falla.

**Acceptance Scenarios**:

1. **Given** el servidor ya desplegado con el render nuevo, **When** un agente viejo (sin soporte de relay) hace su pull, **Then** sigue imprimiendo correctamente con su lógica local (el contenido nuevo del servidor es aditivo y lo ignora sin error).
2. **Given** el servidor nuevo, **When** el agente relay hace su pull, **Then** imprime el contenido que le manda el servidor sin aplicar formato propio.
3. **Given** cualquiera de los dos agentes, **When** una comanda no trae contenido pre-renderizado, **Then** el agente degrada de forma definida (imprime con su render local mínimo o marca el fallo), nunca imprime basura ni se cae.

---

### User Story 3 - Ancho de papel configurable por sector (Priority: P3)

Un local (o un sector) puede tener una impresora de **58mm** u **80mm**. Hoy el ancho está hardcodeado (32/24 columnas). El servidor tiene que renderizar acorde al hardware real sin cambios de código.

**Why this priority**: Habilita locales/sectores con impresoras distintas y cierra la pregunta abierta 58 vs 80mm, pero no bloquea el desacople base (US1/US2) si golf es todo 58mm.

**Independent Test**: Configurar un sector como 80mm y otro como 58mm; cada uno imprime su comanda usando el ancho correcto, sin tocar código.

**Acceptance Scenarios**:

1. **Given** un sector configurado con ancho de papel 80mm, **When** imprime una comanda, **Then** el ticket usa el ancho de línea correspondiente a 80mm.
2. **Given** un sector sin ancho configurado, **When** imprime, **Then** se usa un ancho por defecto definido (58mm) sin error.

---

### Edge Cases

- **Comanda sin contenido pre-renderizado** (servidor viejo o error de render): el agente relay degrada de forma definida — no imprime bytes vacíos ni corruptos.
- **Agente viejo + servidor nuevo**: el contenido nuevo es aditivo; el agente lo ignora y usa su render local (sin romper).
- **Agente relay + servidor viejo** (rollback del servidor): el agente relay no recibe contenido → cae a su render local mínimo o deja la comanda pendiente y avisa, sin perderla.
- **Acentos / caracteres especiales** (á, é, ñ): el render del servidor produce el contenido correcto para la codificación de la impresora, de forma consistente para todos los tipos de comanda.
- **Transporte alternativo (Windows/GDI, texto plano)**: sigue funcionando; el contenido para ese transporte también se resuelve sin depender de la lógica embebida del agente.
- **Integridad del contenido en tránsito**: si el contenido pre-renderizado llega corrupto/incompleto, el agente no imprime un ticket parcial silenciosamente.
- **Multi-tenant**: el contenido de una comanda de un negocio jamás se sirve a un agente de otro negocio (el pull ya está scopeado por `business_id` + key por negocio).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE producir en el **servidor** el contenido a imprimir de cada comanda (el "qué imprimir"), de modo que el ejecutable del local no necesite contener la lógica de formato.
- **FR-002**: El pull de comandas del agente DEBE incluir, de forma **aditiva**, el contenido pre-renderizado por el servidor, sin quitar los datos estructurados que hoy consume el agente actual (retrocompatibilidad).
- **FR-003**: El agente relay DEBE imprimir el contenido pre-renderizado tal cual lo recibe, sin aplicar formato propio, cuando ese contenido está presente.
- **FR-004**: Un agente **anterior** (sin soporte de relay) DEBE seguir imprimiendo correctamente contra el servidor nuevo, ignorando el contenido pre-renderizado.
- **FR-005**: El agente DEBE tener un comportamiento de **degradación definido** cuando no recibe contenido pre-renderizado (render local mínimo, o dejar la comanda pendiente y reportar), sin imprimir contenido corrupto ni caerse.
- **FR-006**: El render del servidor DEBE cubrir **todos los tipos de comanda actuales** con paridad de contenido: normal, anulada (con `NO PREPARAR`), reimpresión (`REIMPRESION`), y el borde "sin ítems".
- **FR-007**: La lógica de render DEBE vivir en un módulo del servidor **testeable** con la suite del repo (unidad), reemplazando los harnests copy-paste actuales; DEBE haber tests que fijen el contenido de cada tipo de comanda.
- **FR-008**: El sistema DEBE permitir configurar el **ancho de papel** (p. ej. 58mm / 80mm) por sector, con un valor por defecto definido; el render DEBE respetarlo.
- **FR-009**: El transporte alternativo (impresora no-térmica / Windows) DEBE seguir soportado: el contenido apropiado para ese transporte se resuelve sin depender de la lógica de formato embebida en el agente.
- **FR-010**: El aislamiento multi-tenant DEBE mantenerse: el contenido de una comanda se sirve solo al agente del negocio dueño (scope por `business_id`, key por negocio de spec 046).
- **FR-011**: Tras la migración, un cambio de formato DEBE poder salir a producción **solo con un despliegue del servidor**, sin recompilar ni redistribuir el ejecutable.

### Key Entities *(include if feature involves data)*

- **Comanda (payload de impresión)**: representa lo que el local debe imprimir para una comanda. Suma al dato estructurado actual un **contenido pre-renderizado** por el servidor, apto para enviar a la impresora tal cual.
- **Sector / estación (config de impresora)**: además del destino de impresión ya existente (IP/puerto/enabled, spec 28), suma metadata de hardware necesaria para renderizar bien — como mínimo el **ancho de papel**, opcionalmente la codificación de caracteres.
- **Agente relay**: versión del ejecutable que transporta el contenido a la impresora y confirma, sin lógica de formato. Cambia rara vez (solo por transporte/protocolo), a diferencia del formato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un cambio de formato del ticket llega a la impresora del local con **cero** recompilaciones del ejecutable y **cero** re-descargas en el local (solo despliegue del servidor).
- **SC-002**: El tiempo desde "decidimos cambiar el formato" hasta "el local imprime con el formato nuevo" baja de un proceso manual multi-paso (rebuild + subida + re-descarga, con intervención en la PC del local) a **un solo despliegue**.
- **SC-003**: El 100% de los tipos de comanda existentes (normal, anulada, reimpresión, sin ítems) se imprime con **paridad o mejora** respecto del agente actual, verificado con tickets de prueba en el local.
- **SC-004**: Durante la migración, el agente anterior sigue imprimiendo **sin errores** contra el servidor nuevo (cero regresiones para el local mientras no se actualiza su ejecutable).
- **SC-005**: Un sector configurado con un ancho de papel distinto imprime correctamente **sin cambios de código**.
- **SC-006**: La lógica de render queda cubierta por tests automatizados del repo para cada tipo de comanda (0 harnests copy-paste).

## Assumptions

- El contenido pre-renderizado que el servidor entrega al agente relay son los **bytes listos para la impresora térmica** (secuencia ESC/POS), transportados de forma segura dentro de la respuesta del pull. La forma concreta (p. ej. base64) se define en `/speckit-plan`.
- Golf es **58mm** hoy; se toma 58mm como ancho por defecto y se agrega configuración por sector para habilitar 80mm u otros.
- El agente relay conserva un **render de texto plano mínimo** como red de seguridad (degradación / transporte Windows), o el servidor entrega también una variante plana; se decide en el plan. En ningún caso el agente vuelve a ser la fuente del formato térmico.
- La migración es **por local**: se despliega el servidor (aditivo, no rompe al agente viejo) y luego se actualiza el ejecutable de golf una única vez al relay. No hay big-bang.
- Se reutiliza el canal de pull/confirm existente (spec 28/35) y el scope por `business_id` + key por negocio (spec 046); esta feature no cambia el transporte ni el modelo de auth.
- El ejecutable relay se rebuildeará solo ante cambios de **transporte/protocolo** (nuevo tipo de impresora, retries, heartbeat), que son infrecuentes y estables; los cambios de **formato** dejan de requerir tocar el ejecutable.
- Dependencias: specs 28 (config por sector / `printer_ip` por comanda), 33 (aviso de fallo), 35 (reimpresión + heartbeat), 046 (autoinstalador + key por negocio). Migración de datos versionada para la nueva metadata de `stations` (constitución: migraciones versionadas + multi-tenant).
