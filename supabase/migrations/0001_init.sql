create extension if not exists "pgcrypto";

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('игры', 'подписки')),
  name text not null,
  has_ps5 boolean not null default true,
  has_ps4 boolean not null default true,
  cover_url text not null default '',
  editions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, name)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('игры', 'подписки')),
  game_name text not null,
  edition text not null default '',
  login text not null,
  slot1 boolean not null default false,
  slot2 boolean not null default false,
  slot3 boolean not null default false,
  slot4 boolean not null default false,
  slot5 boolean not null default false,
  purchase_date timestamptz,
  expense_fiat numeric not null default 0,
  currency text not null default '',
  rate numeric not null default 1,
  expense_total numeric generated always as (coalesce(expense_fiat, 0) * coalesce(rate, 1)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_login_idx on accounts (lower(login));
create index if not exists accounts_lookup_idx on accounts (kind, game_name, edition);

create table if not exists empty_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  region text not null,
  status text not null default 'Свободен',
  is_problem boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  login text not null default '',
  game_name text not null default '',
  edition text not null default '',
  client text not null default '',
  slot text not null default '',
  price numeric,
  price_percent numeric,
  payment_method text not null default '',
  employee text not null default '',
  salary numeric,
  created_at timestamptz not null default now()
);

create index if not exists orders_login_idx on orders (lower(login));

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table if not exists currencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rate numeric not null default 1,
  sort_order int not null default 0
);

create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  emoji text not null default '',
  sort_order int not null default 0
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  login text not null unique,
  password text not null,
  role text not null default 'user',
  name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_catalog_items_updated
  before update on catalog_items
  for each row execute function set_updated_at();

create trigger trg_accounts_updated
  before update on accounts
  for each row execute function set_updated_at();

create trigger trg_empty_accounts_updated
  before update on empty_accounts
  for each row execute function set_updated_at();

alter table catalog_items enable row level security;
alter table accounts enable row level security;
alter table empty_accounts enable row level security;
alter table orders enable row level security;
alter table employees enable row level security;
alter table payment_methods enable row level security;
alter table currencies enable row level security;
alter table regions enable row level security;
alter table app_users enable row level security;

insert into regions (code, emoji, sort_order) values
  ('UKR', '🇺🇦', 1),
  ('TUR', '🇹🇷', 2)
on conflict (code) do nothing;

insert into currencies (name, rate, sort_order) values
  ('RUB', 1, 1)
on conflict (name) do nothing;

insert into payment_methods (name, sort_order) values
  ('Pally', 1),
  ('На карту', 2)
on conflict (name) do nothing;

insert into employees (name, sort_order) values
  ('Админ', 1)
on conflict (name) do nothing;

insert into app_users (login, password, role, name) values
  ('admin', 'change-me', 'admin', 'Администратор')
on conflict (login) do nothing;
