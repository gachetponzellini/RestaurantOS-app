-- Per-business overrides for the markdown documentation of each tool (what
-- the LLM sees in the system prompt about how/when to use the tool).
-- Shape: { "<tool_name>": { "promptSection": "<markdown>" } }
-- Missing entries fall back to the defaults baked into the code (TOOL_METADATA).

alter table public.chatbot_configs
  add column tool_overrides jsonb not null default '{}'::jsonb;
