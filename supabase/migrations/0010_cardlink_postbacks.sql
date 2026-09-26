-- Журнал уведомлений Cardlink (Result URL) как есть — чтобы разбираться, что именно прислал Cardlink.
create table if not exists cardlink_postbacks (
  id bigint generated always as identity primary key,
  fields jsonb not null,
  signature_ok boolean not null,
  created_at timestamptz not null default now()
);

alter table cardlink_postbacks enable row level security;
