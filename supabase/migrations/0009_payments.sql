-- Счета на оплату через Cardlink (кнопка QR в каталоге).
-- status — статус счёта в Cardlink: NEW, PROCESS, UNDERPAID, SUCCESS, OVERPAID, FAIL.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  bill_id text not null unique,
  client_name text not null,
  amount numeric not null,
  link_url text not null,
  status text not null default 'NEW',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_created_at_idx on payments (created_at desc);

alter table payments enable row level security;
