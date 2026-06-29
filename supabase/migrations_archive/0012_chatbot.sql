-- Chatbot: contacts, conversations, messages.
-- Conversations are keyed by (channel, identifier) so the same WhatsApp phone
-- keeps a continuous session regardless of who triggered it on our side.

create table public.chatbot_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'web-test')),
  identifier text not null,
  display_name text,
  created_at timestamptz not null default now(),
  unique (business_id, channel, identifier)
);

create table public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.chatbot_contacts(id) on delete cascade,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index chatbot_messages_conversation_idx
  on public.chatbot_messages (conversation_id, created_at);

create index chatbot_conversations_contact_open_idx
  on public.chatbot_conversations (contact_id) where closed_at is null;
