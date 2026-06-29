-- Per-business chatbot configuration. One row per business (PK = business_id).
-- Starts with system_prompt; will grow to hold WhatsApp credentials, model
-- overrides, enable flags, etc.

create table public.chatbot_configs (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  system_prompt text not null default '',
  updated_at timestamptz not null default now()
);
