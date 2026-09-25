# SUPABASE_SETUP — как поднять бэкенд этого CRM с нуля

> Этот файл — **подробная инструкция для Claude Code**. Если вы получили этот исходный код и хотите
> подключить **свою** базу данных Supabase и настроить всё так же, как в оригинале, — откройте проект
> в Claude Code и скажите ему: **«Прочитай `SUPABASE_SETUP.md` и настрой мой Supabase по этой инструкции»**.
>
> Ниже описано устройство БД «от и до» + пошаговый чеклист развёртывания.

---

## 0. Что это за проект

CRM для шеринга игровых аккаунтов PlayStation (продажа доступа к «слотам» на аккаунтах + учёт
пустых аккаунтов, заказов, расходов/прибыли).

**Архитектура:**

```
┌────────────────────┐        HTTPS GET/POST         ┌──────────────────────────┐
│  Frontend (React/   │  ───────────────────────────► │  Supabase Edge Function  │
│  Vite) на Vercel    │   {URL}/functions/v1/api      │  "api" (Deno, 1 файл)    │
└────────────────────┘                                └────────────┬─────────────┘
                                                                    │ service_role
                                                                    ▼
                                                       ┌──────────────────────────┐
                                                       │  Postgres (Supabase)     │
                                                       │  таблицы + RLS + триггеры │
                                                       └──────────────────────────┘
```

Ключевой принцип: **фронтенд НИКОГДА не ходит в базу напрямую.** На всех таблицах включён RLS
(Row Level Security) и **нет ни одной публичной политики**, поэтому по anon-ключу из браузера
прочитать/записать ничего нельзя. Всё общение идёт через **одну Edge Function `api`**, которая
работает под `service_role` (полный доступ) и содержит всю бизнес-логику.

Соответствие файлов:

| Что | Где |
|-----|-----|
| Схема БД (таблицы, индексы, триггеры, сиды) | `supabase/migrations/` — все файлы по порядку номеров (`0001_init.sql` — базовая схема, следующие — доработки) |
| Вся серверная логика (API) | `supabase/functions/api/index.ts` |
| Конфиг функции (отключён JWT) | `supabase/config.toml` |
| Как фронт формирует URL API | `src/config.ts` |
| Переменные окружения фронта (шаблон) | `.env.example` |

---

## 1. Чеклист для Claude Code (делай по порядку)

1. **Спроси у пользователя** его данные Supabase-проекта (или помоги создать новый):
   - `Project URL` (вида `https://xxxx.supabase.co`)
   - `anon / publishable key`
   - `project ref` (часть поддомена, `xxxx`)
   - авторизацию CLI: `npx supabase login` (интерактивно в его терминале) **или** personal access token.
2. **Применить схему** — выполнить **все** файлы из `supabase/migrations/` по порядку номеров
   на его проекте (см. §5). Без поздних миграций не работают история изменений и прайс.
3. **Секреты функции** — TG_TOKEN / TG_CHAT_ID (опционально). `SUPABASE_URL` и
   `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет в Edge Functions **автоматически** — вручную не нужны (см. §6).
4. **Задеплоить Edge Function `api`** (см. §7). Важно: `verify_jwt = false`.
5. **Создать `.env`** фронтенда из `.env.example` (см. §8).
6. **Завести пользователей приложения** в таблице `app_users` (логин/пароль для входа) — см. §9.
7. **Проверить** через `curl` (см. §10).
8. **Запустить фронт** (`npm install && npm run dev`) или задеплоить на Vercel (см. §11).

Всё, что нужно из инструментов: **Node.js/npm**, **npx supabase** (CLI ставится через npx автоматически),
и опционально **npx vercel** для деплоя фронта.

---

## 2. Обзор всех таблиц

| Таблица | Назначение |
|---------|-----------|
| `catalog_items` | Каталог: игры и подписки (карточки, обложки, издания, платформы) |
| `accounts` | Аккаунты (логины) с занятостью слотов, привязаны к игре/изданию; хранят расход |
| `empty_accounts` | Пустые (свободные) аккаунты, сгруппированные по регионам |
| `orders` | Журнал заказов: шеринг / возвраты / продажи (клиент, слот, цена, сотрудник) |
| `employees` | Справочник сотрудников (для выбора в форме) |
| `payment_methods` | Справочник способов оплаты |
| `currencies` | Справочник валют с курсом к базовой (₽) |
| `regions` | Справочник регионов (код + эмодзи-флаг) |
| `app_users` | Пользователи приложения (авторизация по логину/паролю) |
| `standard_prices` | Цены обычных подписок (вкладка «Стандарт»): раздел `платформа\|регион\|подписка` → цены в ₽ |
| `activity_log` | Журнал всех изменений (вкладка «История»): что сделано, ссылка на исходную запись (`ref_id`), данные для отката (`undo`), время последнего действия (`sort_at`) |

**Связи — «мягкие», по строковым полям, без внешних ключей (FK).**
`accounts.game_name` / `orders.game_name` ссылаются на `catalog_items.name` по совпадению строки
(и `kind`/`type`). Поэтому при переименовании игры сервер (`updateGame`) вручную обновляет
`game_name` в `accounts` и `orders`. Аналогично `accounts.login` ↔ `empty_accounts.email` ↔
`orders.login` связаны по значению почты (регистронезависимо, через `ilike`).

---

## 3. Детальное описание таблиц

### 3.1 `catalog_items` — каталог игр и подписок

| Колонка | Тип | По умолчанию | Смысл |
|---------|-----|--------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `type` | text | — | `'игры'` или `'подписки'` (CHECK) |
| `name` | text | — | Название игры/подписки |
| `has_ps5` | boolean | `true` | Есть ли платформа PS5 (влияет на набор слотов) |
| `has_ps4` | boolean | `true` | Есть ли платформа PS4 |
| `cover_url` | text | `''` | URL обложки |
| `editions` | text[] | `'{}'` | Массив изданий (напр. `{Standard, Deluxe}`), максимум 5 |
| `prices` | jsonb | `'{}'` | Прайс: ключ `"Издание\|PS5\|П3"` → цена в ₽ |
| `created_at` / `updated_at` | timestamptz | `now()` | Метки времени (`updated_at` через триггер) |

Ограничение уникальности: `unique (type, name)` — нельзя две игры с одинаковым именем в одной категории
(но игра и подписка с одинаковым именем — можно).

### 3.2 `accounts` — аккаунты со слотами

| Колонка | Тип | По умолчанию | Смысл |
|---------|-----|--------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `kind` | text | — | `'игры'` или `'подписки'` (CHECK) |
| `game_name` | text | — | К какой игре/подписке привязан (= `catalog_items.name`) |
| `edition` | text | `''` | Издание |
| `login` | text | — | Логин/почта аккаунта |
| `slot1..slot5` | boolean | `false` | Занятость 5 слотов (см. §4 модель слотов) |
| `purchase_date` | timestamptz | NULL | Дата покупки аккаунта |
| `expense_fiat` | numeric | `0` | Расход в валюте `currency` |
| `currency` | text | `''` | Валюта расхода |
| `rate` | numeric | `1` | Курс валюты к базовой (₽) на момент покупки |
| `expense_total` | numeric | **generated** | `coalesce(expense_fiat,0) * coalesce(rate,1)` — расход в ₽, **только чтение** |
| `created_at` / `updated_at` | timestamptz | `now()` | Метки времени |

Индексы: `accounts (lower(login))`, `accounts (kind, game_name, edition)`.

> ⚠️ `expense_total` — вычисляемая колонка. Записать в неё напрямую нельзя. Чтобы изменить «Потрачено»,
> сервер пишет `expense_fiat` = новое значение и `rate` = 1 (действие `updateAccountExpense`).

### 3.3 `empty_accounts` — пустые аккаунты

| Колонка | Тип | По умолчанию | Смысл |
|---------|-----|--------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `email` | text | — | Почта аккаунта |
| `region` | text | — | Код региона (= `regions.code`, хранится/сравнивается в UPPER) |
| `status` | text | `'Свободен'` | Статус |
| `is_problem` | boolean | `false` | «В корзине» / проблемный |
| `created_at` / `updated_at` | timestamptz | `now()` | Метки времени |

Уникальность: `unique (email)`.
В каталог (для экрана «Пустые аккаунты») попадают строки, где `status = 'Свободен' ИЛИ is_problem = true`,
и заполнены `email` и `region`.

### 3.4 `orders` — журнал заказов

| Колонка | Тип | По умолчанию | Смысл |
|---------|-----|--------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `login` | text | `''` | Логин аккаунта, по которому заказ |
| `game_name` | text | `''` | Игра/подписка |
| `edition` | text | `''` | Издание |
| `client` | text | `''` | Имя/ник клиента |
| `slot` | text | `''` | Название слота (напр. `PS5 П3`, `Возврат PS4 П2`) |
| `price` | numeric | NULL | Сумма (у возвратов — отрицательная) |
| `price_percent` | numeric | NULL | (зарезервировано) |
| `payment_method` | text | `''` | Способ оплаты |
| `employee` | text | `''` | Сотрудник |
| `salary` | numeric | NULL | (зарезервировано) |
| `created_at` | timestamptz | `now()` | Дата заказа |

Индекс: `orders (lower(login))`. История слота и суммы «Получено» считаются из этой таблицы.

### 3.5 Справочники (то, что фронт получает как `variables`)

- **`employees`**: `id`, `name` (unique), `sort_order` — сотрудники.
- **`payment_methods`**: `id`, `name` (unique), `sort_order` — способы оплаты.
- **`currencies`**: `id`, `name` (unique), `rate` (numeric, курс к ₽), `sort_order` — валюты.
- **`regions`**: `id`, `code` (unique), `emoji`, `sort_order` — регионы (флаг + код).

### 3.6 `app_users` — пользователи приложения (вход в CRM)

| Колонка | Тип | По умолчанию | Смысл |
|---------|-----|--------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `login` | text | — | Логин (unique) |
| `password` | text | — | Пароль **в открытом виде** (см. предупреждение) |
| `role` | text | `'user'` | Роль (`admin` / `user`) |
| `name` | text | `''` | Отображаемое имя |
| `created_at` | timestamptz | `now()` | — |

> ⚠️ **Безопасность:** пароли хранятся plaintext и сверяются в функции `login`. Это простая схема
> «своей» авторизации, не Supabase Auth. Доступ к таблице закрыт RLS (читает только Edge Function
> под service_role), но всё равно **смените дефолтный пароль** и по возможности используйте несложные,
> но уникальные значения. Для продакшена стоит перейти на хеширование.

**Сессии.** При входе функция выдаёт токен (HMAC-SHA256, живёт 30 дней), фронт хранит его в
`localStorage` и шлёт в заголовке `x-app-token` с каждым запросом. Без действующего токена функция
отвечает `401`, и приложение показывает экран входа. Токен подписан секретом `AUTH_SECRET`
(если не задан — `SUPABASE_SERVICE_ROLE_KEY`) и содержит отпечаток пароля: **смена пароля в
`app_users` сразу обнуляет все выданные токены** этого пользователя. Журнал изменений
(`getActivity*`, `updateActivity`, `deleteActivity`, `restoreActivity`) доступен только роли `admin`.

### 3.7 RLS и триггеры

- **RLS включён на ВСЕХ таблицах, политик нет.** Значит: доступ есть только у `service_role`
  (Edge Function). Anon-ключ из браузера не даёт доступа к таблицам напрямую — это by design.
- Триггер `set_updated_at()` обновляет `updated_at` при UPDATE на `catalog_items`, `accounts`,
  `empty_accounts`.

---

## 4. Модель слотов (важная доменная деталь)

У каждого `accounts` есть 5 булевых слотов `slot1..slot5`. Их смысл зависит от платформ игры:

- Если **и PS5, и PS4** (`has_ps5 && has_ps4`) → **5 слотов**:

  | Колонка | Слот |
  |---------|------|
  | slot1 | PS5 П3 |
  | slot2 | PS5 П3 |
  | slot3 | PS5 П2 |
  | slot4 | PS4 П3 |
  | slot5 | PS4 П2 |

- Иначе (**одна платформа**) → используются **3 слота**:

  | Колонка | Слот |
  |---------|------|
  | slot1 | П3 |
  | slot2 | П3 |
  | slot3 | П2 |

«П3» — primary/основной (их два), «П2» — вторичный. При заказе типа «Возврат» слот освобождается
(логика в функции `applySlot`: два слота П3 обрабатываются парой slot1/slot2, префикс `Возврат`
инвертирует занятие/освобождение). Фронт и бэкенд используют **одинаковый** порядок этих названий,
поэтому индекс слота (`slotIndex`, 0-based) в `toggleSlot` соответствует `slot{index+1}`.

---

## 5. Схема БД (полный SQL)

Канонический источник — папка `supabase/migrations/`: файлы применяются по порядку номеров,
каждый следующий дополняет предыдущие. Применить можно любым способом:

**Способ 1 — Supabase CLI (рекомендуется):**
```bash
# из корня проекта, после npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push        # применит миграции из supabase/migrations
```

**Способ 2 — Dashboard SQL Editor:** открой SQL Editor проекта и по очереди, в порядке номеров,
вставь и выполни содержимое каждого файла из `supabase/migrations/`.

**Способ 3 — Management API** (нужен personal access token `sbp_...`):
```bash
for f in supabase/migrations/*.sql; do
  curl -s -X POST "https://api.supabase.com/v1/projects/<PROJECT_REF>/database/query" \
    -H "Authorization: Bearer <sbp_TOKEN>" -H "Content-Type: application/json" \
    --data-binary @<(jq -Rs '{query: .}' "$f")
done
```

Миграции создают все таблицы (см. §2), индексы, триггер `updated_at`, включают RLS и заливают
**стартовые справочники** (см. §9).

---

## 6. Переменные окружения и секреты

### 6.1 Фронтенд (`.env` в корне, НЕ коммитить — он в `.gitignore`)

```dotenv
# URL проекта Supabase
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
# Публичный anon / publishable ключ (безопасно в браузере)
VITE_SUPABASE_ANON_KEY=<anon_key>
# Необязательно: полный URL Edge Function. Если пусто —
# автоматически берётся ${VITE_SUPABASE_URL}/functions/v1/api
VITE_API_URL=
```

Логика в `src/config.ts`: `API_URL = VITE_SUPABASE_URL/functions/v1/api` (если задан URL), иначе
берётся `VITE_API_URL`.

### 6.2 Секреты Edge Function (в настройках проекта → Edge Functions → Secrets)

| Секрет | Обязателен | Кто задаёт |
|--------|-----------|-----------|
| `SUPABASE_URL` | — | **Подставляет Supabase автоматически** |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Подставляет Supabase автоматически** |
| `TG_TOKEN` | нет | Токен Telegram-бота (уведомления). Можно оставить пустым |
| `TG_CHAT_ID` | нет | ID чата Telegram для уведомлений. Можно оставить пустым |

Если `TG_TOKEN`/`TG_CHAT_ID` не заданы — уведомления просто не отправляются, всё остальное работает.
Задать (по желанию):
```bash
npx supabase secrets set TG_TOKEN=xxxx TG_CHAT_ID=yyyy --project-ref <PROJECT_REF>
```

---

## 7. Деплой Edge Function `api`

`supabase/config.toml` уже содержит:
```toml
[functions.api]
verify_jwt = false
```
Это **обязательно** — фронт вызывает функцию без JWT. Деплой:

```bash
# нужен вход: npx supabase login  (или переменная SUPABASE_ACCESS_TOKEN=sbp_...)
npx supabase functions deploy api --project-ref <PROJECT_REF>
```

Docker не требуется (CLI собирает и загружает через API). Повторяй эту команду после любого изменения
`supabase/functions/api/index.ts`.

---

## 8. Создать `.env`

Скопируй шаблон и заполни:
```bash
cp .env.example .env
# затем впиши VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
```

---

## 9. Первичные данные (сиды)

Миграция уже заливает минимальные справочники (через `on conflict do nothing`):

```sql
-- регионы
insert into regions (code, emoji, sort_order) values
  ('UKR', '🇺🇦', 1), ('TUR', '🇹🇷', 2) on conflict (code) do nothing;

-- валюты (базовая ₽ с курсом 1)
insert into currencies (name, rate, sort_order) values
  ('RUB', 1, 1) on conflict (name) do nothing;

-- способы оплаты
insert into payment_methods (name, sort_order) values
  ('Pally', 1), ('На карту', 2) on conflict (name) do nothing;

-- сотрудники
insert into employees (name, sort_order) values
  ('Админ', 1) on conflict (name) do nothing;

-- пользователь приложения по умолчанию (СМЕНИТЬ пароль!)
insert into app_users (login, password, role, name) values
  ('admin', 'change-me', 'admin', 'Администратор') on conflict (login) do nothing;
```

**Настрой под себя** (примеры SQL — выполнять в SQL Editor или через Management API):

```sql
-- добавить сотрудников
insert into employees (name, sort_order) values ('Иван', 2), ('Пётр', 3);

-- добавить валюту с курсом к рублю (напр. USD ~ 90 ₽)
insert into currencies (name, rate, sort_order) values ('USD', 90, 2);

-- добавить регион
insert into regions (code, emoji, sort_order) values ('POL', '🇵🇱', 3);

-- сменить дефолтного админа / завести пользователей входа
update app_users set password = '<надёжный_пароль>' where login = 'admin';
insert into app_users (login, password, role, name)
  values ('manager', '<пароль>', 'user', 'Менеджер');
```

> Справочники `employees`, `payment_methods`, `currencies`, `regions` — это то, что появляется в
> выпадающих списках приложения (`variables`). Каталог игр/аккаунтов/заказов наполняется уже из
> самого приложения (кнопки «Добавить игру», «Добавить аккаунт», форма заказа).

---

## 10. Проверка (curl)

Замени `<BASE>` на `https://<PROJECT_REF>.supabase.co/functions/v1/api`.

```bash
# 1) Вход (должен вернуть {"success":true,...,"token":"..."} для сид-пользователя)
curl -s -X POST "<BASE>" -d '{"action":"login","login":"admin","password":"change-me"}'

# 2) Каталог с токеном из п.1 (должен вернуть JSON с items/emptyAccounts/variables);
#    без заголовка — {"code":"unauthorized"} и статус 401
curl -s "<BASE>" -H "x-app-token: <TOKEN>"

# 3) Неизвестное действие (проверка, что функция задеплоена)
curl -s -X POST "<BASE>" -H "Content-Type: application/json" -d '{"action":"__ping__"}'
# ожидаемо: {"error":"Неизвестное действие"}  (а НЕ 404/пусто)
```

Если каталог с токеном вернул `items`/`variables` — БД и функция связаны верно.

---

## 11. Запуск и деплой фронтенда

```bash
npm install
npm run dev        # локально (Vite)
npm run build      # прод-сборка в dist/
```

Деплой на Vercel (по желанию):
```bash
npx vercel --prod
# переменные VITE_* задать в настройках проекта Vercel (Environment Variables)
```

При деплое на Vercel обязательно пропиши в его настройках те же `VITE_SUPABASE_URL` и
`VITE_SUPABASE_ANON_KEY`, что и в локальном `.env`.

---

## 12. Полный справочник Edge Function API

Единый эндпоинт: `{SUPABASE_URL}/functions/v1/api`. CORS открыт (`*`). Supabase JWT не требуется,
но все запросы, кроме входа, требуют токен приложения в заголовке `x-app-token` (см. §3.6):
без него — `401 {code:"unauthorized"}`, для admin-действий без роли `admin` — `403 {code:"forbidden"}`.
Поле `actor` (кто сделал действие) функция берёт из токена.

### Вход

- `POST {action:"login", login, password}` → `{ success, role, name, token }` или `{ success:false, message }`.

### GET

- **без параметров** → каталог:
  ```jsonc
  {
    "items": [{
      "id","name","title","type","coverUrl","hasPS5","hasPS4",
      "editions": ["Standard", ...],
      "accountDetails": { "Standard": [ { "email", "slots":[{"isOccupied":bool} ×5] } ] },
      "prices": { "Standard|PS5|П3": 2390 }
    }],
    "emptyAccounts": [{ "email","region","isProblem" }],
    "variables": {
      "employees": ["..."], "paymentMethods": ["..."],
      "currencies": ["..."], "regions": [{ "emoji","code" }]
    }
  }
  ```

### POST (тело — JSON с полем `action`)

| action | Поля запроса | Что делает |
|--------|--------------|-----------|
| `addGame` (алиас `add`) | `type, name, editions[], hasPS5, hasPS4, coverUrl?` | Добавляет карточку. Для `type='игры'` без `coverUrl` пытается подтянуть обложку из PS Store. TG-уведомление |
| `addEdition` | `gameName, type, edition` | Добавляет издание в массив (макс. 5) |
| `updateGame` | `id, name, coverUrl, editions[], hasPS5, hasPS4` | Обновляет карточку; при смене `name` переносит `game_name` в `accounts` и `orders` |
| `updatePrices` | `id, prices{"Издание\|Платформа\|Слот": цена}, actor?` | Сохраняет прайс игры (пустые и нечисловые цены отбрасываются); пишет «Изменены цены» в журнал с возможностью отмены. `{ success, prices }` |
| `updateStandardPrices` | `key` (`"playstation\|ua\|psplus"`), `label`, `prices{"Essential\|1": цена}` | Сохраняет цены обычной подписки (пустые и нечисловые отбрасываются); пишет «Изменены цены подписок» в журнал с возможностью отмены. `{ success, prices }` |
| `backfillCovers` | — | Дозаполняет пустые обложки для игр из PS Store. Возвращает `{updated, failed[]}` |
| `addAccount` | `gameName, edition, login, expense, currency, employee, manualDate?` | Создаёт аккаунт (слоты пустые), убирает из `empty_accounts`, TG |
| `addOrder` | `login, gameName, edition, client, slot, price, paymentMethod, employee, expense?, currency?, manualDate?` | Пишет заказ; занимает/освобождает слот; если логина ещё нет — создаёт аккаунт; чистит пустые; TG |
| `getSlotHistory` | `login` | `{ success, history:[{client, slot, date, price}] }` |
| `getActivity` | `search?, type? (all/order/game/account/empty), offset?` | Журнал действий (таблица `activity_log`, без ручных действий со слотами), новые сверху, по 50 шт. `{ success, events:[{id, type, action, title, details, login, gameName, actor, price, createdAt}], hasMore }`. Все изменяющие действия принимают необязательное поле `actor` — кто совершил действие |
| `getActivityItem` | `id` | Текущие значения редактируемых полей и полная информация записи журнала: `{ success, fields, linked, info:[{label, value, kind?}] }`. `linked=false` — исходных данных уже нет, запись можно только убрать |
| `updateActivity` | `id, fields` | Правит исходные данные записи (заказ, аккаунт, игру, издание, пустой аккаунт) и саму запись журнала |
| `deleteActivity` | `id` | Отменяет действие (удаляет заказ и возвращает слот, удаляет игру/аккаунт, откатывает изменения) и заменяет запись на «Удалён …» (`action='deleted'`, в `undo.journal` — всё, что изменено). `{ success, warnings[] }` или `{ success:false, error }`. Для записи `deleted` — удаляет её насовсем |
| `restoreActivity` | `id` записи `deleted` | Возвращает всё, что убрало удаление, вместе с исходной записью журнала |
| `getAccountInfo` | `login` | `{ success, spent, received, profit, createdAt }` (агрегаты по `accounts`+`orders`) |
| `updateAccountExpense` | `login, gameName?, edition?, expense` | Ставит `expense_fiat=expense, rate=1, currency='RUB'` у совпавших аккаунтов |
| `toggleSlot` | `gameName, edition, email, slotIndex (0-based), newValue ('' = освободить, иначе занять)` | Переключает `slot{index+1}` |
| `addEmptyAccount` | `email, region` | Добавляет/освобождает запись в `empty_accounts` (`status='Свободен'`) |
| `markProblem` | `email` | `is_problem = true` (в корзину) |
| `unmarkProblem` | `email` | `is_problem = false` (из корзины) |

Ответ успешных мутаций обычно `{ "success": true }` или `{ "error": "..." }` / `{ "success": false, "error": "..." }`.

---

## 13. Частые проблемы

| Симптом | Причина / решение |
|---------|-------------------|
| `{"error":"Неизвестное действие"}` на существующее действие | Функция не задеплоена или задеплоена старая версия → `npx supabase functions deploy api` |
| Каталог пустой, но данные есть | Проверь, что RLS не блокирует Edge Function (она должна работать под service_role — ключ подставляется автоматически); проверь секреты |
| Вход не проходит | Нет строки в `app_users` или неверный пароль (plaintext-сравнение) |
| Обложки не подтягиваются | Скрипт обложек работает только для `type='игры'`; для подписок обложка задаётся вручную (URL) |
| 404 на эндпоинт | Неверный `PROJECT_REF` в `VITE_SUPABASE_URL`, либо функция не задеплоена |
| CORS-ошибка | Не должно быть — функция отдаёт `Access-Control-Allow-Origin: *`. Проверь, что бьёшь по `/functions/v1/api` |

---

## 14. Чеклист безопасности перед передачей/продом

- [ ] Сменить дефолтного `admin` / `change-me` в `app_users`.
- [ ] Не коммитить `.env` (уже в `.gitignore`).
- [ ] Personal access token (`sbp_...`), если использовался для setup, — **отозвать** после настройки
      (Supabase Dashboard → Account → Access Tokens).
- [ ] Секреты `TG_TOKEN`/`TG_CHAT_ID` — только в Secrets функции, не в коде.
- [ ] По возможности — перейти на хеширование паролей `app_users`.
