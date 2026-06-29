-- Chatbot cart: the bot holds the cart server-side in the conversation, and
-- generates a short token to hand off to the web checkout. The cart_state
-- shape mirrors `CartItem` from src/stores/cart.ts so the web can hydrate
-- Zustand 1:1 without mapping.

alter table public.chatbot_conversations
  add column cart_state jsonb not null default '{}'::jsonb,
  add column cart_token text unique;

create index chatbot_conversations_cart_token_idx
  on public.chatbot_conversations (cart_token)
  where cart_token is not null;
