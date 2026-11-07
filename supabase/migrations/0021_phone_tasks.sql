-- Задания для телефона с PS App (раздел админа «Долги партнёров»): войти в сохранённый аккаунт
-- или ввести код с экрана консоли. Задание создаёт сайт, выполняет программа на компьютере,
-- к которому телефон подключён по USB (agent/phone-agent.mjs), и записывает сюда итог.
create table if not exists phone_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                     -- login | console_code | agent (отметка «программа запущена»)
  email text not null default '',         -- login: в какой аккаунт войти
  code text not null default '',          -- console_code: код с экрана консоли
  status text not null default 'pending', -- pending | running | done | error
  message text not null default '',       -- что пошло не так или чем закончилось
  actor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists phone_tasks_created_idx on phone_tasks (created_at desc);

alter table phone_tasks enable row level security;
