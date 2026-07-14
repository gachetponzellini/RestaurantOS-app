-- 0008_chatbot_conversations_agent_enabled.sql
-- Spec 32 (bandeja de conversaciones WhatsApp — handoff humano).
--
-- Agrega el flag de handoff por conversación. Cuando el staff apaga el agente
-- (`agent_enabled = false`) para una conversación, el webhook entrante persiste
-- el mensaje del cliente PERO no invoca al LLM: lo atiende un humano desde la
-- bandeja. El default `true` preserva el comportamiento actual (bot siempre ON).
--
-- RLS: sin policies nuevas. `chatbot_conversations` sigue deny-all / solo
-- service-role (la bandeja baja por service client), así que hereda la política
-- existente. Aditiva → no toca datos.

alter table "public"."chatbot_conversations"
  add column if not exists "agent_enabled" boolean not null default true;

comment on column "public"."chatbot_conversations"."agent_enabled" is
  'Handoff (spec 32): true = el bot responde automáticamente; false = lo atiende un humano — el webhook persiste el mensaje entrante y NO invoca al LLM. Se togglea desde la bandeja del admin (toggleConversationAgent).';
