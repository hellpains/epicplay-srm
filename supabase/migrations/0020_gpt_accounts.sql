-- Сохранённые аккаунты ChatGPT (раздел админа «Долги партнёров»): почта, пароль и ключ 2FA.
-- Ключ 2FA — строка, которую ChatGPT показывает при подключении приложения-аутентификатора.
create table if not exists gpt_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password text not null default '',
  totp text not null default '',          -- ключ 2FA; пусто — двухэтапного входа нет
  created_at timestamptz not null default now()
);

create index if not exists gpt_accounts_created_idx on gpt_accounts (created_at desc);

alter table gpt_accounts enable row level security;
