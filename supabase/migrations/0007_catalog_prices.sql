-- Прайс игры: цена по изданию, платформе и слоту.
-- Ключ — "Издание|PS5|П3", значение — цена в рублях.
alter table catalog_items
  add column if not exists prices jsonb not null default '{}'::jsonb;
