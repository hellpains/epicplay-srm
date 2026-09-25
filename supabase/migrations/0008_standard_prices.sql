-- Цены обычных подписок (вкладка «Стандарт»).
-- key — раздел: "playstation|ua|psplus"; prices — {"Essential|1": 990, ...}, цена в рублях.
create table if not exists standard_prices (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  prices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table standard_prices enable row level security;
