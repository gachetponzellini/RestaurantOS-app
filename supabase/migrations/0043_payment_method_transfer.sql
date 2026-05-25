-- Agrega 'transfer' como método de pago.
-- El piloto usa transferencias bancarias; hoy caen en 'other'.
alter table payments
  drop constraint payments_method_check;

alter table payments
  add constraint payments_method_check
  check (method in ('cash', 'card_manual', 'mp_link', 'mp_qr', 'transfer', 'other'));

comment on column payments.method is
  'Payment method: cash, card_manual, mp_link, mp_qr, transfer, other.';
