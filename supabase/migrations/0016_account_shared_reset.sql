-- Дата последнего сброса общего доступа аккаунта (кнопка со стрелкой в строке аккаунта)
alter table accounts
  add column if not exists shared_reset_at date;
