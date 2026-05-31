# Spec — 07-caja-rendicion-mozos Rendición de mozos + asignación de cajas

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Dinero en **centavos**; scope **business_id + RLS**; **timezone AR** para rótulos de turno.

## ADDED Requirements

### Requisito: Calcular la rendición de un mozo

El sistema DEBE calcular, para un mozo y su período abierto (desde su última rendición), el
**efectivo a entregar** y el **detalle por método** a partir de los `payments` con
`attributed_mozo_id = mozo` y `payment_status = 'paid'`, **excluyendo la propina** (`tip_cents`).
El efectivo a entregar es la suma de pagos con `method = 'cash'`; tarjeta y transferencia se
informan como tickets (no son efectivo físico que el mozo entrega). El cálculo vive en una función
pura testeable `src/lib/caja/liquidacion-mozo.ts`.

#### Escenario: efectivo + tickets, sin contar propina

- **Dado** que el mozo "Darío" tiene en su período pagos atribuidos: efectivo $10.000 (con propina
  $1.500), efectivo $5.000, tarjeta $20.000 y transferencia $8.000 (todos `paid`)
- **Cuando** se calcula su rendición
- **Entonces** el efectivo a entregar es **$15.000** (sólo `cash`, sin la propina)
- **Y** el detalle informa tarjeta $20.000 y transferencia $8.000 como tickets
- **Y** la propina ($1.500) **no** forma parte del monto a rendir

#### Escenario: mozo sin pagos en el período

- **Dado** que el mozo no tiene pagos atribuidos desde su última rendición
- **Cuando** se calcula su rendición
- **Entonces** el efectivo a entregar es **$0** y el detalle por método queda en cero

### Requisito: Registrar la rendición de fin de turno por mozo

El sistema DEBE permitir a un **encargado o admin** registrar la rendición de un mozo: persiste
el monto esperado (efectivo a entregar calculado), el monto efectivamente entregado y la
diferencia (`entregado − esperado`), en la tabla `mozo_rendiciones` con scope `business_id`.
La rendición **cierra el período** de ese mozo: los pagos hasta ese instante no vuelven a aparecer
en su próxima rendición. La acción valida con Zod y chequea permiso en `can.ts`
(`canRendirMozo`). Es **independiente** del corte de caja (`hacerCorte`).

#### Escenario: rendición registrada cierra el período del mozo

- **Dado** que "Darío" debe rendir $15.000 de efectivo según el cálculo
- **Y** que un encargado autenticado opera la pestaña de rendición
- **Cuando** registra la rendición con monto entregado $15.000
- **Entonces** se crea una fila en `mozo_rendiciones` con esperado $15.000, entregado $15.000 y
  diferencia $0
- **Y** una nueva consulta de la rendición de Darío arranca un período nuevo (no reaparecen los
  pagos ya rendidos)

#### Escenario: diferencia exige nota y el mozo no puede registrar su propia rendición

- **Dado** que el efectivo a entregar es $15.000 pero el mozo entrega $14.000
- **Cuando** un **mozo** (rol `mozo`) intenta registrar la rendición
- **Entonces** la acción falla porque `canRendirMozo` es sólo encargado/admin
- **Y** cuando la registra el encargado con diferencia ≠ 0 sin nota/motivo, la acción exige el
  motivo de la diferencia antes de persistir

### Requisito: Asignar y desasignar cajas a un usuario

El sistema DEBE permitir al **admin** asignar una caja a un usuario y quitar esa asignación,
persistido en `caja_user_assignments` (relación usuario↔caja, scope `business_id`, n:m). La caja y
el usuario deben pertenecer al mismo `business`. Una asignación duplicada (mismo usuario + misma
caja) no se vuelve a crear.

#### Escenario: el admin asigna una caja a un usuario

- **Dado** un admin autenticado y una caja "Barra" del negocio
- **Cuando** asigna la caja "Barra" al usuario que opera el bar
- **Entonces** se crea la fila en `caja_user_assignments` (usuario, caja, `business_id`)
- **Y** la pantalla de cajas muestra a ese usuario como operador de "Barra"

#### Escenario: permiso y scope cross-tenant

- **Dado** un usuario con rol `encargado`
- **Cuando** intenta asignar una caja a otro usuario
- **Entonces** la acción falla porque sólo `canManageCajas` (admin) puede asignar cajas
- **Y** si el `caja_id` pertenece a **otro** negocio, la acción falla por scope (`business_id`)

## MODIFIED Requirements

### Requisito: El board de caja no mezcla la rendición de mozos

Hoy `CajaAdminBoard` (`src/components/admin/local/caja-admin-board.tsx`) muestra el período de
caja, movimientos y corte. Pasa a ser distinto: la **rendición de mozos vive en su propia pestaña**
y el corte de caja (`hacerCorte`) **no** consume ni depende de las rendiciones. El arqueo de caja
sigue calculándose con `calculateExpectedCash` sobre `payments` con `method='cash'` de esa caja, sin
restar lo que los mozos rinden (no hay doble conteo: la caja registra los cobros; la rendición es la
conciliación de la billetera personal del mozo).

#### Escenario: corte de caja independiente de la rendición

- **Dado** un período de caja con cobros en efectivo y mozos que aún no rindieron
- **Cuando** el encargado hace el corte de esa caja
- **Entonces** el efectivo esperado se calcula igual que hoy (`calculateExpectedCash`) sin tocar las
  rendiciones de mozos
- **Y** registrar o no las rendiciones de los mozos no altera el `expected_cash_cents` del corte
