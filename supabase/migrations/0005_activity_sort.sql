-- Порядок в журнале: по времени последнего действия с записью.
-- sort_at — когда запись создали, изменили или восстановили (по нему сортируем);
-- edited_at — когда запись последний раз правили (для пометки «изменено»).
alter table activity_log add column if not exists sort_at timestamptz;
alter table activity_log add column if not exists edited_at timestamptz;

update activity_log set sort_at = created_at where sort_at is null;

alter table activity_log alter column sort_at set default now();
alter table activity_log alter column sort_at set not null;

create index if not exists activity_log_sort_idx on activity_log (sort_at desc);
