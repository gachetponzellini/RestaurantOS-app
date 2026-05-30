# RestaurantOS — Visión de producto

> Narrativa de producto y dominio. Complementa a [`../AGENTS.md`](../AGENTS.md) (técnico) y a
> [`config.yaml`](config.yaml) (proceso SDD). Para *cómo* trabajar, ver esos dos. Acá: *qué* es,
> *para quién* y *en qué estado* está.

---

## 1. Qué es

SaaS **multi-tenant de gestión integral para restaurantes**. Un solo deploy sirve a varios negocios;
cada negocio obtiene:

- **Carta digital pública** (mobile-first): menú, menú del día, bebidas, carrito, checkout, reservas.
- **Operación de salón**: app del mozo (mesas, pedidos, cuenta, cobro), comandas por sector,
  plano del local.
- **Caja**: cobros, arqueo/corte, movimientos, rendición de mozos, caja de bar.
- **Administración**: catálogo, menús del día, promos/campañas, stock, costeo, RRHH, reservas.
- **Analítica**: ventas, rentabilidad, performance de mozos, tiempos de preparación, arqueos.
- **Facturación AR** (ARCA/AFIP), **pagos** (Mercado Pago) y **chatbot de reservas** (WhatsApp).

## 2. Cliente piloto y realidad operativa

Complejo gastronómico con **dos locales**: **House** y **Golf** (cada uno es un `business` separado).
Hoy operan con **MaxiRest** (POS legacy) y están **migrando**: productos, precios, mapa de mesas y
sectores se tomaron de MaxiRest.

- **Deploy on-site**: el sistema corre en un servidor local conectado a las **comanderas**
  (impresoras de cocina por sector); el equipo accede por **AnyDesk** y exponiendo puertos con
  credenciales. Se instala **duplicado** para House y Golf — backend casi idéntico; lo único
  complejo es **Meta** (cada local necesita su número de WhatsApp, su cuenta de Meta y su Mercado Pago).
- **Go-live objetivo: ~2 semanas.** ARCA y Mercado Pago se conectan al momento de la instalación.
- **Bloqueante clave**: la integración con **ARCA** (facturación electrónica) es lo único que falta
  resolver bien.

El backlog vigente nace de la **reunión de demo** (2026-05-29):
[`../../RestaurantOS_Reunion/Reunion_Demo_RestaurantOS.md`](../../RestaurantOS_Reunion/Reunion_Demo_RestaurantOS.md).

## 3. Usuarios y roles

| Rol | Quién | Hace |
| --- | --- | --- |
| **Cliente final** | comensal | navega la carta, pide delivery/retiro, reserva mesa, paga |
| **Mozo** | camarero | toma pedidos por mesa, envía a comanda, cobra, transfiere mesa, rinde su turno |
| **Encargado** | manager (ej. Rocío) | panel de administración, anular mesa/producto, caja, reservas |
| **Dueño / admin** | Martín + socio | todo lo del encargado + config, analítica, **panel consolidado House+Golf** |
| **Personal** | cocina, bar | recibe comandas; ficha entrada/salida |
| **Admin de plataforma** | equipo dev | alta/gestión de negocios, impersonación |

Reglas de permiso ya decididas: **anular mesa/producto sólo desde el mostrador** (el mozo no);
**fichaje sólo desde las PCs del local**; el **panel consolidado** sólo lo ven los dueños.

## 4. Modelo de dominio (alto nivel)

- **Negocio (`business`)** → tiene salones → **mesas**; categorías → **productos** (con sector de
  cocina, grupos de adicionales, tiempo de prep); **menús del día** y **sugerencias del día**.
- **Pedido**: nace en salón (mozo/mesa) o online (carta → delivery/retiro). Lleva ítems con
  modificadores/observaciones. Los ítems se rutean a **comandas** por sector (cocina, parrilla,
  fritera, postre y café, sanguchería).
- **Cuenta**: detalle de la mesa; admite **split** por ítems o por personas; **propina** (manejada
  **por fuera** de lo facturable); se **cobra** en caja (principal/bar) por varios métodos.
- **Caja**: registra cobros y movimientos; cierra con **arqueo**; los mozos hacen **rendición**.
- **Reserva**: fecha, comensales, salón, horario; se **asigna mesa**; dispara estados y mensajes.
- **Factura** (ARCA): se emite por negocio (certificado + CUIT + punto de venta); admite anulación
  con motivo y **pedido flash** (monto sin desglose).
- **Stock / costeo / proveedores / RRHH / campañas / analítica**: módulos de back-office.

## 5. Estado actual

**Muy avanzado.** Migraciones `0001–0051` ya modelan comandas, caja, cuenta/splits, pagos,
menús del día, promos, campañas, reservas, RRHH, facturas/AFIP, stock y recetas/costeo. La mayoría de
los pedidos de la reunión son **refinamientos sobre módulos existentes**, no construcción nueva.

**Pendiente real** (de la reunión):
- Módulos nuevos: **Proveedores**, **Campañas** (parcial), **rendición de mozos**, **caja de bar**,
  **pedido flash**.
- Integración **ARCA** (bloqueante de go-live).
- Conectar credenciales: **API key de Anthropic** (chatbot), **token Mercado Pago**.
- Ajustes de UX/negocio: bebidas en un slide, envío **bonificado**, guarniciones **aparte**,
  colapso de estados + auto-march a cocina, **propina fuera del total/métricas**, dark mode, branding.
- Datos a importar: insumos/proveedores desde Excel de MaxiRest; mapa actual del salón (bug de plano
  duplicado).

Todo esto está formalizado como **16 cambios SDD** en
[`changes/README.md`](changes/README.md).

## 6. Principios de producto (de la reunión, no re-litigar)

- **Envío bonificado**, no "$0": el delivery es gratis y se comunica como *Bonificado*.
- **Guarniciones siempre como producto aparte**, nunca incluidas en el plato.
- **Un solo estado operativo de pedido**: se elimina "Empezar"; queda "Entregar → Entregado".
- **Pedidos online van directo a cocina** (auto-march); se muestra si están pagados o pagan efectivo.
- **Propina por fuera** del total facturable y fuera de las métricas (el posnet separa lo impositivo).
- **La barra no manda a comanda** (salvo sanguchería/tostados/tocaditos).
- **Notificaciones configurables**: el dueño no quiere recibir todo; quién recibe qué es ajustable.
- **Multi-local duplicado** House + Golf, con consolidado sólo para dueños.

## 7. Restricciones técnicas que el producto impone

- **Multi-tenant estricto**: todo dato scopeado por `business_id` + RLS; nada cruza negocios salvo el
  panel consolidado (sólo dueños).
- **Dinero en centavos**; **timezone AR**; **on-site** (comanderas en red local, no internet).
- **Secretos por negocio** (MP, ARCA, Meta): nunca en chat ni en commits; enmascarar al pedir output.
