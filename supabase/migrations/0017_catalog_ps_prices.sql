-- Цены игры в PlayStation Store Турции и Украины: {productId, tr, ua, updatedAt}.
-- Обновляются сервером раз в сутки, в каталоге — под названием игры
alter table catalog_items
  add column if not exists ps_prices jsonb;
