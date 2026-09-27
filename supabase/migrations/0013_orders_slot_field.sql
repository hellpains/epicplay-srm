-- Точный слот заказа (slot1..slot5). Название слота («PS5 П3») не различает два слота П3,
-- поэтому отдельно храним колонку аккаунта, которую заказ занял или освободил.
alter table orders
  add column if not exists slot_field text;

-- Прошлые заказы: слот уже записан в журнале (undo.slot.field) — переносим оттуда
update orders o
set slot_field = l.undo -> 'slot' ->> 'field'
from activity_log l
where l.ref_id = o.id
  and l.action in ('order_add', 'order_return')
  and l.undo -> 'slot' ->> 'field' is not null
  and o.slot_field is null;
