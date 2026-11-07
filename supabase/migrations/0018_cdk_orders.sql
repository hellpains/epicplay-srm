-- Оформления подписок ChatGPT по кодам CDK (вкладка «CDK») через сервис ZovoCard.
-- Активацию запускает браузер сотрудника; здесь — что оформляли и чем закончилось.
create table if not exists cdk_orders (
  id uuid primary key default gen_random_uuid(),
  product text not null,                  -- тариф в приложении: "Pro|20"
  label text not null default '',         -- "ChatGPT Pro 20x"
  email text not null default '',         -- почта клиента из его токена
  code text not null,                     -- потраченный код CDK
  status text not null default 'pending', -- pending | success | rejected
  zovo_status text not null default '',   -- статус заказа у ZovoCard: queued, running, completed, declined...
  zovo_order_id bigint,
  -- По токену и устройству браузер спрашивает у ZovoCard результат, пока заказ не завершён
  redemption_token text not null default '',
  device text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cdk_orders_created_idx on cdk_orders (created_at desc);

alter table cdk_orders enable row level security;
