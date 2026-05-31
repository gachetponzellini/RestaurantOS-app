# Spec — 06-cobro-y-propina Propina fuera del facturable, métodos y split

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: Registrar método de cortesía no facturable
El sistema DEBE soportar el método **`cortesia`** para saldar una cuenta sin cobro facturable (cuenta
invitada). La cortesía **no** suma a las métricas de ventas ni al esperado de caja, y sólo puede
aplicarla un rol autorizado (encargado/admin), con registro de quién la aplicó. Scope `business_id`.

#### Escenario: Encargado salda una cuenta por cortesía
- **Dado** una cuenta abierta y un usuario con rol **encargado**
- **Cuando** registra el pago con método `cortesia`
- **Entonces** la cuenta queda saldada sin sumar al total de ventas
- **Y** queda registrado que la saldó ese encargado

#### Escenario: Mozo sin permiso no puede dar cortesía
- **Dado** un usuario con rol **mozo** sin permiso de cortesía
- **Cuando** intenta saldar la cuenta con método `cortesia`
- **Entonces** el sistema rechaza la operación por permisos

### Requisito: Soportar cheque como método de pago
El sistema DEBE incluir **`cheque`** como método de pago válido (aunque sea de uso esporádico), tanto en
el enum de métodos como en la constraint de `payments.method`.

#### Escenario: Se registra un pago con cheque
- **Dado** una cuenta con saldo pendiente
- **Cuando** se registra un pago con método `cheque`
- **Entonces** el pago se guarda con `method = "cheque"`
- **Y** suma al cobro de la cuenta como cualquier método no-efectivo

## MODIFIED Requirements

### Requisito: Excluir la propina del total facturable
Hoy `calculateTotals` calcula `total = subtotal − descuento + propina`, metiendo la propina en el total.
El comportamiento cambia: el **total facturable** DEBE ser `subtotal − descuento`. La propina se expone
y se cobra **por separado** (no se suma al total facturable ni a las métricas de ventas). El dinero se
maneja en **centavos**.

#### Escenario: El total facturable no incluye la propina
- **Dado** una cuenta con subtotal $10.000, descuento $0 y propina $1.000
- **Cuando** el sistema calcula los totales
- **Entonces** el total facturable es $10.000
- **Y** la propina $1.000 se reporta aparte (no sumada al facturable)

#### Escenario: La propina no entra en las métricas de ventas
- **Dado** un cobro con propina registrado en una caja
- **Cuando** se calculan las métricas de ventas de esa caja
- **Entonces** la propina figura en `total_propinas_cents` (separado)
- **Y** no se suma a `total_ventas_cents`

### Requisito: Prorratear el split sin inflar el facturable con propina
Hoy `expectedBySplitItems` prorratea la propina dentro del `expected_amount_cents` de cada split. El
comportamiento cambia: el **monto facturable** de cada split DEBE basarse en `subtotal − descuento`
prorrateados; la propina prorrateada se expone aparte, no como parte del facturable del split.

#### Escenario: División por ítems mantiene la propina aparte
- **Dado** una cuenta dividida por ítems en dos splits, con propina total $600
- **Cuando** el sistema calcula el `expected` de cada split
- **Entonces** el facturable de cada split refleja su `subtotal − descuento` prorrateado
- **Y** la propina prorrateada de cada split se expone por separado del facturable

#### Escenario: División por personas reparte parejo el facturable
- **Dado** una cuenta de $100.00 dividida entre 3 personas
- **Cuando** el sistema prorratea el facturable
- **Entonces** los facturables son $33.33 / $33.33 / $33.34 (el residuo va al primer split)
- **Y** la propina, si existe, se reparte aparte del facturable

### Requisito: Quitar el recargo "+10%" de tarjeta
Hoy el método tarjeta puede aplicar un recargo del 10% (`payment_method_configs.adjustment_percent`). El
comportamiento cambia: ese recargo del 10% en tarjeta DEBE quedar en **0** (sin recargo automático por
pagar con tarjeta).

#### Escenario: Pagar con tarjeta no agrega 10%
- **Dado** una cuenta con total facturable $10.000 y tarjeta sin recargo configurado
- **Cuando** el cobrador selecciona el método tarjeta
- **Entonces** el monto a cobrar sigue siendo $10.000 (sin sumar 10%)

## REMOVED Requirements

### Requisito: Link de Mercado Pago en la pantalla de cobro del mozo
Se elimina la opción **`mp_link`** ("Link Mercado Pago") de la pantalla de cobro del mozo
(`cobrar-client.tsx`). El link de MP pertenece al flujo del **cliente que pide desde su teléfono**, no
al cobro presencial del mozo. El **QR de MP** (`mp_qr`) se mantiene para cobro presencial.

#### Escenario: El cobro del mozo no ofrece link de MP
- **Dado** la pantalla de cobro del mozo
- **Cuando** el mozo elige el método de pago
- **Entonces** no aparece la opción "Link Mercado Pago"
- **Y** sí está disponible el QR de Mercado Pago para cobro presencial
