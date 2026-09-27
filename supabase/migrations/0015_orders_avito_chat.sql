-- Чат Авито клиента заказа: если клиента выбрали из чатов Авито, его ник в истории — ссылка на чат
alter table orders
  add column if not exists avito_chat_id text;
