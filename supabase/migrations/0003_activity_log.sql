-- Журнал всех изменений в приложении (вкладка «История» у админа).
-- type: 'order' | 'game' | 'account' | 'slot' | 'empty'
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  details text not null default '',
  login text not null default '',
  game_name text not null default '',
  actor text not null default '',
  price numeric,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on activity_log (created_at desc);

alter table activity_log enable row level security;

-- Переносим уже накопленную историю, чтобы журнал не начинался с нуля.
insert into activity_log (type, title, details, login, game_name, actor, price, created_at)
select
  case when event <> '' then 'slot' else 'order' end,
  case
    when event = 'manual_free' then 'Слот освобождён вручную'
    when event = 'manual_occupy' then 'Слот занят вручную'
    when slot ilike '%возврат%' then 'Возврат'
    else 'Новый заказ'
  end,
  concat_ws(' · ',
    nullif(game_name || coalesce(' (' || nullif(edition, '') || ')', ''), ''),
    nullif(slot, ''),
    case when event = '' then nullif(client, '') end),
  login,
  game_name,
  employee,
  case when event = '' then price end,
  created_at
from orders;

insert into activity_log (type, title, details, game_name, created_at)
select
  'game',
  case when type = 'подписки' then 'Добавлена подписка' else 'Добавлена игра' end,
  name,
  name,
  created_at
from catalog_items;

insert into activity_log (type, title, details, login, game_name, created_at)
select
  'account',
  'Добавлен аккаунт',
  game_name || coalesce(' (' || nullif(edition, '') || ')', ''),
  login,
  game_name,
  coalesce(purchase_date, created_at)
from accounts;

insert into activity_log (type, title, details, login, created_at)
select 'empty', 'Добавлен пустой аккаунт', region, email, created_at
from empty_accounts;
