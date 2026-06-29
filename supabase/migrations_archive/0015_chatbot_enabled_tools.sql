-- Per-business toggle of which chatbot tools are enabled. NULL = all enabled
-- (default behavior, preserves backwards compat). Non-null = explicit allow-list.

alter table public.chatbot_configs
  add column enabled_tools text[];
