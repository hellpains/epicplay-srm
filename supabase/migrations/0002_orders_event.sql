-- Помечаем ручные действия со слотами в истории заказов.
-- '' — обычный заказ/возврат, 'manual_free' — слот освобождён вручную,
-- 'manual_occupy' — слот занят вручную.
alter table orders
  add column if not exists event text not null default '';
