# Tareas — 03-checkout-envio-y-pagos-cliente Envío bonificado, cupón automático y estado de pago en delivery

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos

- [ ] Sin migración para "Bonificado" ni para el indicador de pago: `delivery_fee_cents` (0010),
      `payment_method`/`payment_status` (0001) ya existen.
- [ ] Confirmar si la **relación cliente↔cupón** ya existe en el modelo de promos. Si **no**
      existe, la auto-aplicación queda limitada a lo que haya disponible (su alta es del cambio
      §16); registrar la decisión en la pregunta abierta del proposal.

## 2. Dominio (TDD)

- [ ] Test (rojo): helper de presentación del rótulo de envío — "Bonificado" sólo para
      `delivery_type = 'delivery'` con costo 0; monto formateado si > 0; "Retiro" sin cambios.
      (Co-ubicado con el componente o como util en `src/lib/`.)
- [ ] Test (rojo): resolución del cupón asignado a la cuenta pasa por `validatePromoCode`; cupón
      inválido (vencido/mínimo/agotado) → no se pre-aplica (no error bloqueante).
- [ ] Implementar la resolución server-side del cupón asignado (reutilizando
      `src/lib/promos/validate.ts` y, si aplica, `src/lib/promos/preview-action.ts`).
- [ ] Test (rojo): derivación del indicador de pago a partir de `payment_method` +
      `payment_status` ("Pagado" / "Paga en efectivo" / pendiente / falló).

## 3. UI

- [ ] Rótulo "Bonificado" en la fila de envío de
      `src/components/checkout/order-tracking.tsx` (envío a domicilio con costo 0).
- [ ] Rótulo "Bonificado" en el resumen de `src/components/checkout/checkout-form.tsx`
      (diferenciar de "Retiro").
- [ ] En la página que renderiza `CheckoutForm`, cargar server-side el cupón asignado a la cuenta
      (validado) y pasarlo como prop inicial pre-aplicada; nunca enviar `mp_access_token` al
      cliente (sólo `mp_accepts_payments`).
- [ ] Indicador de pago en `src/components/admin/order-card.tsx` usando
      `payment_method`/`payment_status` de `src/lib/admin/orders-query.ts`.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de los archivos tocados (que el token de MP no se filtre al cliente; que el
      total mostrado siga validándose en `persist-order.ts`).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
