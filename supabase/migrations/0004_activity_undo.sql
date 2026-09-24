-- Правка и отмена записей журнала.
-- action — код действия, ref_id — строка-источник (заказ, аккаунт, игра...),
-- undo — состояние «до», нужное для отката.
alter table activity_log add column if not exists action text not null default '';
alter table activity_log add column if not exists ref_id uuid;
alter table activity_log add column if not exists undo jsonb;

-- Коды действий для уже накопленных записей
update activity_log set action = case title
    when 'Новый заказ' then 'order_add'
    when 'Возврат' then 'order_return'
    when 'Слот занят вручную' then 'slot_manual'
    when 'Слот освобождён вручную' then 'slot_manual'
    when 'Добавлен аккаунт' then 'account_add'
    when 'Изменён расход аккаунта' then 'account_expense'
    when 'Добавлена игра' then 'game_add'
    when 'Добавлена подписка' then 'game_add'
    when 'Добавлено издание' then 'edition_add'
    when 'Изменена игра' then 'game_update'
    when 'Подтянуты обложки' then 'covers'
    when 'Добавлен пустой аккаунт' then 'empty_add'
    when 'Пустой аккаунт обновлён' then 'empty_update'
    when 'Пустой аккаунт перенесён в корзину' then 'empty_trash'
    when 'Пустой аккаунт восстановлен из корзины' then 'empty_restore'
    else ''
  end
where action = '';

-- Связываем старые записи с исходными строками (по логину, игре и времени)
update activity_log l set ref_id = (
  select o.id from orders o
  where lower(o.login) = lower(l.login)
    and o.game_name = l.game_name
    and (o.event <> '') = (l.type = 'slot')
    and abs(extract(epoch from (o.created_at - l.created_at))) < 5
  order by abs(extract(epoch from (o.created_at - l.created_at)))
  limit 1
)
where l.type in ('order', 'slot') and l.ref_id is null;

update activity_log l set ref_id = (
  select a.id from accounts a
  where lower(a.login) = lower(l.login)
    and a.game_name = l.game_name
    and (
      abs(extract(epoch from (coalesce(a.purchase_date, a.created_at) - l.created_at))) < 5
      or abs(extract(epoch from (a.created_at - l.created_at))) < 5
    )
  limit 1
)
where l.action = 'account_add' and l.ref_id is null;

update activity_log l set ref_id = (
  select c.id from catalog_items c where c.name = l.game_name limit 1
)
where l.action in ('game_add', 'edition_add', 'game_update') and l.ref_id is null;

update activity_log l set ref_id = (
  select e.id from empty_accounts e where lower(e.email) = lower(l.login) limit 1
)
where l.type = 'empty' and l.ref_id is null;
