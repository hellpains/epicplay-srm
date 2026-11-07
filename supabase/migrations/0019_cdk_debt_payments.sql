-- Выплаты долга сотрудниками с ролью gpt (страница «Долги»): сотрудник сам отмечает, сколько отдал.
-- Долг = сумма за оформленные подписки минус эти выплаты.
create table if not exists cdk_debt_payments (
  id uuid primary key default gen_random_uuid(),
  login text not null,                    -- логин сотрудника, который отдал деньги
  amount numeric not null,                -- сколько отдал, в рублях
  created_at timestamptz not null default now()
);

create index if not exists cdk_debt_payments_created_idx on cdk_debt_payments (created_at desc);

alter table cdk_debt_payments enable row level security;
