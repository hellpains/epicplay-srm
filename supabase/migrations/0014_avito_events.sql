-- События веб-хука Авито (новые сообщения в чатах). Приложение следит за последним событием
-- и по нему сразу обновляет чаты, не опрашивая Авито постоянно.
create table if not exists avito_events (
  id bigint generated always as identity primary key,
  message_id text unique,
  chat_id text not null,
  author_id bigint,
  type text,
  text text,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists avito_events_chat_idx on avito_events (chat_id, id desc);

alter table avito_events enable row level security;
