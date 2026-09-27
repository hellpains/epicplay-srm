-- Заметки к слотам аккаунта: {"1": "текст", "3": "текст"} — ключ = номер слота (1–5).
alter table accounts
  add column if not exists slot_notes jsonb not null default '{}'::jsonb;
