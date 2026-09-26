-- Данные из уведомлений Cardlink. В уведомлении нет номера платежа (TrsId — номер многоразовой ссылки),
-- поэтому отмечаем, какие строки уже связаны с уведомлением, чтобы не связать одну строку дважды.
alter table payments
  add column if not exists bank text,
  add column if not exists payer_account text,
  add column if not exists postback_id bigint references cardlink_postbacks (id);
