-- ============================================
-- 0068 — Hardening del chatbot: una conversación abierta por contacto
-- ============================================
-- Spec 20 (hardening-chatbot-pre-webhook). Garantía dura a nivel DB de que NO
-- coexistan dos conversaciones abiertas (closed_at IS NULL) para el mismo
-- contacto. Mata la race de "doble-open" que aparece cuando llegan mensajes
-- casi simultáneos — típico en WhatsApp: el cliente manda 2-3 mensajes seguidos
-- y `getOrOpenConversation` podía crear dos conversaciones en paralelo.
--
-- Antes de crear el índice, deduplicamos el estado actual: si un contacto tiene
-- varias abiertas, conservamos la más reciente (por updated_at, desempate
-- created_at) y cerramos las demás (closed_at = now()). No se borra ninguna
-- conversación ni sus mensajes — sólo se cierran las sobrantes.
--
-- El índice único reemplaza al índice no-único `chatbot_conversations_contact_open_idx`
-- de 0012 (mismo predicado y columna): el único sirve igual para el lookup de
-- `getOrOpenConversation` y además impone la unicidad.
-- ============================================

-- 1. Dedupe: cerrar las abiertas duplicadas, conservando la más reciente.
with ranked as (
  select
    id,
    row_number() over (
      partition by contact_id
      order by updated_at desc, created_at desc
    ) as rn
  from public.chatbot_conversations
  where closed_at is null
)
update public.chatbot_conversations c
set closed_at = now()
from ranked r
where c.id = r.id
  and r.rn > 1;

-- 2. Reemplazar el índice no-único por el único parcial.
drop index if exists public.chatbot_conversations_contact_open_idx;

create unique index if not exists chatbot_conversations_one_open_per_contact
  on public.chatbot_conversations (contact_id)
  where closed_at is null;
