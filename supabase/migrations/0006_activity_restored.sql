-- Когда запись журнала восстановили после удаления (для пометки «восстановлено»)
alter table activity_log add column if not exists restored_at timestamptz;
