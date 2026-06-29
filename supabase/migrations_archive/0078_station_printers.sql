-- ═══════════════════════════════════════════════════════════════════════
-- 0078 — La comandera vive en el sector (spec 28)
--
-- Cada `station` (sector: cocina, parrilla, bar…) imprime sus comandas en una
-- impresora térmica de la LAN del local. Hasta ahora el mapeo IP↔sector vivía
-- (en el diseño viejo, d3) en JSONB de settings o hardcodeado en el print
-- agent. Lo movemos a columnas de `stations`: es 1:1 (una impresora por
-- sector) y ya está scopeado por `business_id` con RLS.
--
-- La IP NO es un secreto (es LAN), así que va en columnas normales y se lee con
-- las policies existentes de `stations` (members 0025 + platform 0033). No se
-- agregan policies. Aditivo: defaults sensatos para las filas existentes.
--   • printer_ip      → null = sector sin impresora configurada (el agente lo
--                       saltea, deja la comanda `pendiente`, no se pierde).
--   • printer_port    → 9100 (puerto RAW/JetDirect estándar de impresoras ESC/POS).
--   • printer_enabled → true (el sector existe y rutea; el toggle lo apaga).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.stations
  add column if not exists printer_ip text,
  add column if not exists printer_port integer not null default 9100,
  add column if not exists printer_enabled boolean not null default true;
