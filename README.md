# CRM App (PS Sharing) — Supabase Edition

Мобильная CRM для учёта игровых аккаунтов PlayStation, шеринга слотов, подписок,
пустых аккаунтов и заказов. Бэкенд построен на **Supabase** (PostgreSQL + одна
Edge Function `api`); фронтенд — React + Vite.

> 📘 **Полное описание базы данных, схемы всех таблиц, справочник по всем действиям
> API и пошаговая настройка «с нуля» — в [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).**
>
> Этот README — краткий обзор проекта и runbook по эксплуатации фронтенда/деплою.
> Всё, что касается устройства БД и первичной настройки, живёт в `SUPABASE_SETUP.md`,
> чтобы не дублировать и не расходиться. Если получили проект и настраиваете свою
> базу — начните с `SUPABASE_SETUP.md`.

---

## 1. Технологический стек

| Слой        | Технология                                              |
|-------------|---------------------------------------------------------|
| Фронтенд    | React 19 + Vite + TypeScript + Tailwind + Framer Motion |
| Бэкенд-API  | Supabase Edge Function `api` (Deno / TypeScript)        |
| База данных | Supabase PostgreSQL (RLS без публичных политик)         |
| Уведомления | Telegram Bot API (вызывается из Edge Function)          |

Ключевой принцип: фронтенд не ходит в таблицы напрямую — только через Edge Function
`api`, которая работает под `service_role`. Подробнее об архитектуре — в
[`SUPABASE_SETUP.md` §0](SUPABASE_SETUP.md).

---

## 2. Быстрый старт (фронтенд)

```bash
npm install
cp .env.example .env     # значения VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev              # разработка
npm run build            # прод-сборка в dist/
```

`src/config.ts` собирает итоговый `API_URL` как `${VITE_SUPABASE_URL}/functions/v1/api`
(или берёт `VITE_API_URL`, если задан). Захардкоженных ключей/URL в коде нет.

**Настройка бэкенда** (создание проекта Supabase, применение схемы, секреты, деплой
Edge Function, сиды, пользователи входа) — целиком в
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md), разделы §5–§11.

---

## 3. Структура проекта

```
mrcrm-app/
├── .env.example              # шаблон подключения к Supabase (скопировать в .env)
├── SUPABASE_SETUP.md         # полное описание БД + пошаговая настройка (главный референс)
├── src/
│   ├── config.ts             # сборка API_URL из env
│   ├── App.tsx               # вход (AuthWall), навигация, загрузка каталога
│   ├── CatalogScreen.tsx     # каталог игр/подписок, слоты, история, настройки карточки
│   ├── AddOrderModal.tsx     # форма заказа / шеринг-аккаунта
│   ├── EmptyAccountsScreen.tsx   # пустые аккаунты + «корзина»
│   └── components/AddGameModal.tsx
└── supabase/
    ├── config.toml           # verify_jwt=false для функции api
    ├── migrations/                # схема БД: 0001_init.sql + доработки, применять по порядку
    └── functions/api/index.ts     # весь бэкенд (единый эндпоинт /functions/v1/api)
```

Аутентификация: экран входа `AuthWall` (`src/App.tsx`) шлёт `POST {action:"login"}`,
функция сверяет логин/пароль с таблицей `app_users` и выдаёт токен; фронт хранит его в
`localStorage` и отправляет в заголовке `x-app-token` через `apiFetch` (`src/config.ts`).
Детали и предупреждения по безопасности — в
[`SUPABASE_SETUP.md` §3.6](SUPABASE_SETUP.md).

---

## 4. Эксплуатация (runbook)

Ниже — операции **фронтенда/деплоя**, специфичные для этого репозитория. Операции
над **базой и функцией** (применить схему, задеплоить `api`, завести пользователей,
включить Telegram, сменить пароль admin) описаны в
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — §5–§10, §13. Не дублирую их здесь.

Обозначения: `<project-ref>` — ref проекта Supabase (из URL
`https://<project-ref>.supabase.co`), `$SUPABASE_ACCESS_TOKEN` — personal access
token `sbp_...` (Dashboard → Account → Access Tokens).

> Публичный (`publishable`/`anon`) ключ безопасен для браузера; **service_role** и
> **secret** ключи в репозиторий/README класть нельзя.

### 4.1. Изменить переменные окружения на Vercel
`VITE_*` вшиваются в бандл **на этапе сборки**, поэтому после изменения нужен
передеплой.
```bash
vercel env ls production                     # посмотреть текущие
vercel env rm VITE_SUPABASE_URL production   # изменить = удалить и добавить заново
printf 'https://<project-ref>.supabase.co' | vercel env add VITE_SUPABASE_URL production
printf '<publishable-key>' | vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod                                # пересобрать и выложить
```
Те же значения держите в локальном `.env`, чтобы `npm run dev` смотрел туда же.

### 4.2. Задеплоить / обновить фронтенд
```bash
npm run build      # проверить, что собирается локально
vercel --prod      # деплой в продакшн (первый раз привяжет проект → .vercel/)
```

### 4.3. Ротация access-токена Supabase
Personal access token (`sbp_...`) — доступ ко **всему** аккаунту. Если он куда-то
попал (чат, лог, скриншот): Dashboard → Account → **Access Tokens** → revoke старый,
сгенерировать новый. В коде/README он не хранится — просто используйте новый в
командах деплоя.

---

## 5. Чувствительные данные

Из кода удалено всё чувствительное — проект можно передавать:
- URL/секреты внешних сервисов → заменены на `API_URL` из env.
- Токен и chat_id Telegram-бота → только секреты Supabase (`TG_TOKEN`,
  `TG_CHAT_ID`), в коде их нет.
- Реальные логины/пароли → только демо-`admin`/`change-me` в миграции (**сменить**,
  см. [`SUPABASE_SETUP.md` §9/§14](SUPABASE_SETUP.md)).

`.env` с реальными ключами в git не коммитится (см. `.gitignore`).

---

## Карта для ассистента

- **Точка входа фронта:** `src/App.tsx` → `API_URL` из `src/config.ts`
  (`VITE_SUPABASE_URL` + `/functions/v1/api`).
- **Весь бэкенд:** `supabase/functions/api/index.ts`. Полный список действий и их
  контракты — в [`SUPABASE_SETUP.md` §12](SUPABASE_SETUP.md) (там всегда актуальный
  перечень; не дублируй его здесь, чтобы не разошлось).
- **Схема БД:** `supabase/migrations/` (все файлы по порядку номеров), подробно расписана в
  [`SUPABASE_SETUP.md` §2–§4](SUPABASE_SETUP.md). Модель слотов: `slot1/slot2`=PS5 П3,
  `slot3`=PS5 П2/П2, `slot4`=PS4 П3, `slot5`=PS4 П2.
- **Расход:** генерируемая колонка `accounts.expense_total = expense_fiat * rate`.
- **Доступ:** Edge Function работает под `service_role` (обходит RLS); фронт ходит
  без Supabase JWT (`verify_jwt=false`), но с токеном приложения в `x-app-token` — все запросы
  идут через `apiFetch`. Прямых запросов из браузера в таблицы нет.
- **Инварианты при правках:** сохранять JSON-контракт ответов, на который завязан
  фронт: `items[].accountDetails[edition][] = {email, slots:[{isOccupied}×5]}`,
  `emptyAccounts[] = {email, region, isProblem}`,
  `variables = {employees, paymentMethods, currencies, regions:[{emoji,code}]}`.
- **Секреты:** только в Supabase secrets / `.env`, никогда в коде.
#   e p i c p l a y - s r m  
 #   e p i c p l a y - s r m  
 