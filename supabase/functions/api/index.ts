import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TG_TOKEN = Deno.env.get("TG_TOKEN") ?? "";
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID") ?? "";
const CARDLINK_TOKEN = Deno.env.get("CARDLINK_TOKEN") ?? "";
// API Cardlink пускает только IP из вайтлиста, поэтому ходим в него через прокси Fixie
// с постоянными адресами: http://user:pass@host:port. Используется только для баланса.
const FIXIE_URL = Deno.env.get("FIXIE_URL") ?? "";
const CARDLINK_API = "https://cardlink.link/api/v1";
const PROXY_TIMEOUT_MS = 20_000;
// Чаты Авито: ключи приложения из кабинета Авито (Настройки → API)
const AVITO_CLIENT_ID = Deno.env.get("AVITO_CLIENT_ID") ?? "";
const AVITO_CLIENT_SECRET = Deno.env.get("AVITO_CLIENT_SECRET") ?? "";
const AVITO_API = "https://api.avito.ru";
// Секрет в адресе веб-хука: Авито не подписывает уведомления, поэтому чужие запросы отсекаем по ключу
const AVITO_WEBHOOK_KEY = Deno.env.get("AVITO_WEBHOOK_KEY") ?? "";
// Многоразовая ссылка Cardlink и робот на Vercel, который вводит в неё сумму
// и возвращает прямую ссылку СБП (qr.nspk.ru)
const CARDLINK_TRANSFER_URL = Deno.env.get("CARDLINK_TRANSFER_URL") ?? "";
const SBP_ROBOT_URL = Deno.env.get("SBP_ROBOT_URL") ?? "";
const SBP_ROBOT_KEY = Deno.env.get("SBP_ROBOT_KEY") ?? "";
// ZovoCard: заказы по кодам CDK (вкладка «CDK»). Ключ работает только с IP из его вайтлиста,
// поэтому запросы идут через свой прокси с постоянным адресом: http://user:pass@host:port
const ZOVOCARD_API_KEY = Deno.env.get("ZOVOCARD_API_KEY") ?? "";
const ZOVO_PROXY_URL = Deno.env.get("ZOVO_PROXY_URL") ?? "";
const ZOVOCARD_API = "https://zovocard.com/openapi/v1";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sendTG(message: string) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: "HTML" }),
    });
  } catch (_e) {
    return;
  }
}

function toBool(v: unknown) {
  return v === true || v === "TRUE" || v === "true";
}

// Поиск в PlayStation Store — тот же запрос, которым ищет сам сайт магазина (GraphQL getSearchResults).
// Страница поиска больше не отдаёт результаты в HTML, они приходят отдельным запросом.
const PS_SEARCH_HASH = "4df6284f982e57bec70f23c77e2c219dc792eb19af7fb3d3a81767aa3f1958aa";
// Только сами игры и их издания — без скинов, карт, валюты и прочих дополнений
const PS_GAME_CLASSES = new Set(["FULL_GAME", "PREMIUM_EDITION", "GAME_BUNDLE"]);

// Регионы магазина для поиска. Украинский ищет только по-украински/по-русски, остальные — на своём языке;
// английские названия игр находятся во всех перечисленных
const PS_REGIONS: Record<string, { country: string; language: string; locale: string; name: string; currency: string }> = {
  tr: { country: "TR", language: "en", locale: "en-TR", name: "Турция", currency: "TRY" },
  ua: { country: "UA", language: "uk", locale: "uk-UA", name: "Украина", currency: "UAH" },
  in: { country: "IN", language: "en", locale: "en-IN", name: "Индия", currency: "INR" },
  pl: { country: "PL", language: "pl", locale: "pl-PL", name: "Польша", currency: "PLN" },
  us: { country: "US", language: "en", locale: "en-US", name: "США", currency: "USD" },
  // Японский магазин отвечает только на японском языке; названия многих игр там всё равно английские
  jp: { country: "JP", language: "ja", locale: "ja-JP", name: "Япония", currency: "JPY" },
};

async function psStoreSearch(term: string, size = 24, region = "tr") {
  const { country, language, locale } = PS_REGIONS[region];
  const variables = {
    countryCode: country,
    languageCode: language,
    nextCursor: "",
    pageOffset: 0,
    pageSize: size,
    searchTerm: term,
  };
  const extensions = { persistedQuery: { version: 1, sha256Hash: PS_SEARCH_HASH } };
  const url =
    "https://web.np.playstation.com/api/graphql/v1/op?operationName=getSearchResults" +
    `&variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;
  const response = await fetch(url, {
    headers: { "content-type": "application/json", "x-psn-store-locale-override": locale },
  });
  if (!response.ok) throw new Error(`PlayStation Store ответил ${response.status}`);
  const body = await response.json().catch(() => ({}));
  const results = body?.data?.universalSearch?.results ?? [];
  return results
    .filter((r: any) => PS_GAME_CLASSES.has(r.storeDisplayClassification))
    .map((r: any) => {
      const images: Record<string, string> = {};
      for (const m of r.media ?? []) if (m.type === "IMAGE" && !images[m.role]) images[m.role] = m.url;
      // MASTER — квадратная обложка, как на карточках каталога
      const cover = images.MASTER || images.GAMEHUB_COVER_ART || images.EDITION_KEY_ART || "";
      return {
        id: str(r.id),
        classification: str(r.storeDisplayClassification),
        price: r.price?.isFree ? "Бесплатно" : str(r.price?.discountedPrice || r.price?.basePrice),
        basePrice: str(r.price?.basePrice),
        isFree: Boolean(r.price?.isFree),
        name: str(r.name),
        kind: str(r.localizedStoreDisplayClassification),
        platforms: (r.platforms ?? []).map((pl: string) => str(pl)).filter(Boolean),
        cover,
      };
    })
    .filter((r: any) => r.name && r.cover);
}

// Обложка для игры по названию — первая найденная игра в магазине
async function getPSImageUrl(gameName: string): Promise<string> {
  const name = (gameName ?? "").trim();
  if (!name) return "";
  try {
    const found = await psStoreSearch(name, 12);
    const exact = found.find((r: any) => r.name.toLowerCase() === name.toLowerCase());
    return (exact ?? found[0])?.cover ?? "";
  } catch (_e) {
    return "";
  }
}

// Название для сравнения: без регистра, ударений, «™ ® ©», апострофов и лишних знаков
// («Battlefield™ 6» = «Battlefield 6», «Ghost of Yōtei» содержит «yotei»)
function normalizeGameName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[’'`:,.!?\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Та же игра среди результатов магазина: в названии магазина есть все слова нашего названия
// (в каталоге названия короткие: «Fc 26» → «EA SPORTS FC 26»). Сначала точное совпадение, потом полная игра.
// Если ни одно название не подходит — цены нет, случайную игру не берём
function matchStoreGame(found: any[], gameName: string) {
  const name = normalizeGameName(gameName);
  const words = name.split(" ").filter(Boolean);
  if (!words.length) return undefined;
  const fits = found.filter((r) => {
    const storeWords = new Set(normalizeGameName(r.name).split(" "));
    return words.every((w) => storeWords.has(w));
  });
  return (
    fits.find((r) => normalizeGameName(r.name) === name) ??
    fits.find((r) => r.classification === "FULL_GAME") ??
    fits[0]
  );
}

// ---------- Сравнение цен игры по регионам ----------

// Число из цены магазина в любом формате: «1.499,00 TL», «Rs 2,399», «$29.99», «¥4,730», «UAH 1 199,00».
// Разделитель дробной части — последний «.» или «,», за которым ровно две цифры; остальные — разделители тысяч
function parseStorePrice(value: string) {
  const cleaned = value.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^(.*)[.,](\d{2})$/);
  const whole = (match ? match[1] : cleaned).replace(/[.,]/g, "");
  const n = Number(`${whole}.${match ? match[2] : "0"}`);
  return Number.isFinite(n) ? n : null;
}

// Курсы ЦБ (рублей за единицу валюты); обновляются раз в сутки — держим в памяти 6 часов
let cbrRates: { rates: Record<string, number>; at: number } | null = null;
async function getCbrRates() {
  if (cbrRates && Date.now() - cbrRates.at < 6 * 60 * 60 * 1000) return cbrRates.rates;
  const response = await fetch("https://www.cbr-xml-daily.ru/daily_json.js");
  const body = await response.json();
  const rates: Record<string, number> = {};
  for (const [code, v] of Object.entries<any>(body.Valute ?? {})) rates[code] = v.Value / v.Nominal;
  cbrRates = { rates, at: Date.now() };
  return rates;
}

// Цены игры во всех регионах — по каждому изданию (обычное, Deluxe, Ultimate…).
// Издания находим в турецком магазине: товары, чьё название начинается с названия игры.
// В остальных регионах то же издание ищем по номеру товара, а если он там свой — по названию
// Слова, из которых состоят названия изданий: «Digital Deluxe Edition», «Cross-Gen Bundle», «PS4 & PS5»
const EDITION_WORDS = new Set([
  "digital", "standard", "deluxe", "ultimate", "gold", "premium", "complete", "special", "definitive",
  "cross", "gen", "launch", "edition", "bundle", "collection", "ps4", "ps5", "&", "and",
]);

// Название — это та же игра или её издание: совпадает или отличается только словами издания
// («Minecraft Dungeons II» — не издание «Minecraft Dungeons»)
function isEditionOf(normalizedName: string, normalizedBase: string) {
  if (normalizedName === normalizedBase) return true;
  if (!normalizedName.startsWith(`${normalizedBase} `)) return false;
  return normalizedName.slice(normalizedBase.length).trim().split(" ").every((w) => EDITION_WORDS.has(w));
}

// Сама игра для выбранного названия: могли выбрать сразу издание («EA SPORTS FC 27 Ultimate Edition PS4 & PS5»).
// Отрезаем с конца слова изданий — остаётся «ea sports fc 27». Товара с таким названием в магазине может и не быть
function baseGameName(selected: string) {
  const words = normalizeGameName(selected).split(" ").filter(Boolean);
  while (words.length > 1 && EDITION_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// Подпись издания: «Стандартное» для самой игры, иначе слова издания («Ultimate Edition PS4 & PS5»)
function editionLabelFor(normalizedName: string, base: string) {
  if (normalizedName === base) return "Стандартное";
  return normalizedName
    .slice(base.length)
    .trim()
    .split(" ")
    .map((w) => (/^ps\d$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

async function handlePsRegionPrices(data: any) {
  const selectedName = str(data.name);
  if (!selectedName) return json({ success: false, error: "Не указана игра" }, 400);
  const rates = await getCbrRates().catch(() => ({} as Record<string, number>));
  const base = baseGameName(selectedName);
  // Ищем по названию самой игры — так находятся все её издания
  const name = base;

  const byRegion: Record<string, any[]> = {};
  await Promise.all(
    Object.keys(PS_REGIONS).map(async (code) => {
      byRegion[code] = await psStoreSearch(name, 40, code).catch(() => []);
    }),
  );

  const seen = new Set<string>();
  let editions = (byRegion.tr ?? []).filter((r: any) => {
    const n = normalizeGameName(r.name);
    // Бесплатные позиции (например, Friend's Pass) — не издания для продажи
    if (r.isFree || seen.has(r.id) || !isEditionOf(n, base)) return false;
    seen.add(r.id);
    return true;
  });
  if (editions.length === 0) {
    const single = matchStoreGame(byRegion.tr ?? [], name);
    editions = single ? [single] : [];
  }

  const result = editions.map((edition: any) => {
    const prices = Object.entries(PS_REGIONS)
      .map(([code, region]) => {
        // У игр, которые в регионе выпускает другой издатель (часто в Японии и США), номер товара свой —
        // тогда берём товар с точно таким же названием
        const editionName = normalizeGameName(edition.name);
        const found = byRegion[code] ?? [];
        const hit =
          found.find((r: any) => r.id === edition.id) ??
          found.find((r: any) => !r.isFree && normalizeGameName(r.name) === editionName);
        if (!hit) return null;
        const amount = hit.isFree ? 0 : parseStorePrice(hit.price);
        const rate = rates[region.currency];
        return {
          code,
          country: region.name,
          price: hit.price,
          basePrice: hit.basePrice && hit.basePrice !== hit.price ? hit.basePrice : null,
          rub: amount !== null && rate ? Math.round(amount * rate) : null,
        };
      })
      .filter(Boolean)
      .sort((x: any, y: any) => (x.rub ?? Infinity) - (y.rub ?? Infinity));
    return {
      id: edition.id,
      name: edition.name,
      label: editionLabelFor(normalizeGameName(edition.name), base),
      kind: edition.kind,
      cover: edition.cover,
      prices,
    };
  });

  // Сначала сама игра, дальше издания по цене в Турции
  result.sort((x: any, y: any) => {
    const xBase = normalizeGameName(x.name) === base ? 0 : 1;
    const yBase = normalizeGameName(y.name) === base ? 0 : 1;
    if (xBase !== yBase) return xBase - yBase;
    const trX = x.prices.find((p: any) => p.code === "tr")?.rub ?? Infinity;
    const trY = y.prices.find((p: any) => p.code === "tr")?.rub ?? Infinity;
    return trX - trY;
  });
  return json({ success: true, editions: result.filter((e: any) => e.prices.length > 0) });
}

// Подсказки при добавлении игры: название, тип, платформы и обложка
async function handlePsSearch(data: any) {
  const term = str(data.query);
  if (term.length < 2) return json({ success: true, results: [] });
  try {
    const found = await psStoreSearch(term, 24);
    // Одна и та же игра встречается отдельно для PS4 и PS5 — объединяем по названию
    const byName = new Map<string, any>();
    for (const r of found) {
      const key = r.name.toLowerCase();
      const prev = byName.get(key);
      if (prev) prev.platforms = Array.from(new Set([...prev.platforms, ...r.platforms]));
      else byName.set(key, { ...r });
    }
    return json({ success: true, results: Array.from(byName.values()).slice(0, 10) });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 502);
  }
}

function fmtDate(value: unknown) {
  if (!value) return "";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) {
    const s = String(value).trim();
    return s.split(" ")[0];
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function resolveDate(manualDate: unknown) {
  if (manualDate) {
    const d = new Date(manualDate as string);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

async function getRate(currency: string) {
  if (!currency) return 1;
  const { data } = await db
    .from("currencies")
    .select("rate")
    .eq("name", currency.trim())
    .maybeSingle();
  const rate = data?.rate;
  return rate ? Number(rate) : 1;
}

async function buildCatalog() {
  const [catalogRes, accountsRes, emptyRes, empRes, payRes, curRes, regRes, stdRes] =
    await Promise.all([
      db.from("catalog_items").select("*"),
      db.from("accounts").select("*").order("created_at", { ascending: true }),
      db.from("empty_accounts").select("*"),
      db.from("employees").select("name").order("sort_order"),
      db.from("payment_methods").select("name").order("sort_order"),
      db.from("currencies").select("name").order("sort_order"),
      db.from("regions").select("code, emoji").order("sort_order"),
      db.from("standard_prices").select("key, prices"),
    ]);

  const catalog = catalogRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const empty = emptyRes.data ?? [];

  const accMap: Record<string, Record<string, any[]>> = {};
  for (const a of accounts) {
    const key = `${a.kind}|${(a.game_name ?? "").trim()}`;
    const ed = (a.edition ?? "").trim();
    if (!accMap[key]) accMap[key] = {};
    if (!accMap[key][ed]) accMap[key][ed] = [];
    const notes = a.slot_notes ?? {};
    accMap[key][ed].push({
      email: (a.login ?? "").trim() || "Без почты",
      sharedResetAt: a.shared_reset_at ?? null,
      // Когда аккаунт добавлен (дата покупки, иначе дата создания) — от неё годовой таймер подписок
      addedAt: a.purchase_date ?? a.created_at ?? null,
      slots: [a.slot1, a.slot2, a.slot3, a.slot4, a.slot5].map((occupied, i) => ({
        isOccupied: toBool(occupied),
        note: notes[String(i + 1)] ?? "",
      })),
    });
  }

  const items = catalog.map((row: any) => {
    const editions = (row.editions ?? []).filter(
      (e: string) => e && e.trim() !== "",
    );
    const key = `${row.type}|${(row.name ?? "").trim()}`;
    const accountDetails: Record<string, any[]> = {};
    for (const ed of editions) {
      accountDetails[ed] = accMap[key]?.[ed] ?? [];
    }
    return {
      id: row.id,
      name: row.name,
      title: row.name,
      type: (row.type ?? "").toLowerCase().trim(),
      coverUrl: row.cover_url ?? "",
      hasPS5: toBool(row.has_ps5),
      hasPS4: toBool(row.has_ps4),
      editions,
      accountDetails,
      prices: row.prices ?? {},
    };
  });

  const emptyAccounts = empty
    .filter(
      (e: any) =>
        (e.status === "Свободен" || e.is_problem === true) &&
        (e.email ?? "").trim() !== "" &&
        (e.region ?? "").trim() !== "",
    )
    .map((e: any) => ({
      email: (e.email ?? "").trim(),
      region: (e.region ?? "").trim().toUpperCase(),
      isProblem: e.is_problem === true,
    }));

  const variables = {
    employees: (empRes.data ?? []).map((r: any) => r.name),
    paymentMethods: (payRes.data ?? []).map((r: any) => r.name),
    currencies: (curRes.data ?? []).map((r: any) => r.name),
    regions: (regRes.data ?? []).map((r: any) => ({
      emoji: r.emoji,
      code: r.code,
    })),
    standardPrices: Object.fromEntries(
      (stdRes.data ?? []).map((r: any) => [r.key, r.prices ?? {}]),
    ),
  };

  return { items, emptyAccounts, variables };
}

// --- Авторизация -----------------------------------------------------------
// Токен = base64url(JSON) + "." + HMAC-SHA256(подпись). Подписывается секретом,
// который есть только у функции, поэтому подделать его из браузера нельзя.
// В токене — отпечаток пароля: смена пароля сразу делает старые токены недействительными.
const AUTH_SECRET = Deno.env.get("AUTH_SECRET") || SERVICE_ROLE_KEY;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

let signingKey: CryptoKey | null = null;
async function sign(data: string) {
  signingKey ??= await crypto.subtle.importKey(
    "raw",
    encoder.encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", signingKey, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

async function passwordFingerprint(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(AUTH_SECRET + password));
  return toBase64Url(new Uint8Array(digest)).slice(0, 16);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function issueToken(user: any) {
  const payload = {
    l: user.login,
    e: Date.now() + TOKEN_TTL_MS,
    p: await passwordFingerprint(String(user.password)),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

type AuthUser = { login: string; role: string; name: string };

async function verifyToken(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(signature, await sign(body))) return null;

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch (_e) {
    return null;
  }
  if (!payload?.l || typeof payload.e !== "number" || payload.e < Date.now()) return null;

  // Пользователь мог быть удалён или сменить пароль после выдачи токена
  const { data: user } = await db
    .from("app_users")
    .select("login, password, role, name")
    .eq("login", payload.l)
    .maybeSingle();
  if (!user || payload.p !== (await passwordFingerprint(String(user.password)))) return null;

  return { login: user.login, role: user.role, name: user.name };
}

async function login(loginValue: string, password: string) {
  // Без учёта регистра: клавиатура телефона сама делает первую букву заглавной.
  // % и _ в ilike — спецсимволы, экранируем их.
  const { data } = await db
    .from("app_users")
    .select("login, password, role, name")
    .ilike("login", loginValue.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();

  if (data && String(data.password) === String(password)) {
    return { success: true, role: data.role, name: data.name, token: await issueToken(data) };
  }
  return { success: false, message: "Неверный логин или пароль" };
}

const MIN_PASSWORD_LENGTH = 6;

// Код приглашения: без него зарегистрироваться нельзя. Секрет не задан — регистрация закрыта совсем
const REGISTRATION_CODE = Deno.env.get("REGISTRATION_CODE") ?? "";

// Самостоятельная регистрация по коду приглашения: новый пользователь всегда получает роль user
async function register(loginValue: string, password: string, code: string) {
  if (!REGISTRATION_CODE) return { success: false, message: "Регистрация закрыта" };
  if (!safeEqual(code.trim(), REGISTRATION_CODE)) return { success: false, message: "Неверный код приглашения" };

  const newLogin = loginValue.trim();
  if (newLogin.length < 3 || newLogin.length > 32 || /\s/.test(newLogin)) {
    return { success: false, message: "Логин: от 3 до 32 символов без пробелов" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, message: `Пароль: минимум ${MIN_PASSWORD_LENGTH} символов` };
  }

  // Вход не учитывает регистр, поэтому и занятость логина проверяем без его учёта
  const { data: existing } = await db
    .from("app_users")
    .select("id")
    .ilike("login", newLogin.replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  if (existing?.length) return { success: false, message: "Такой логин уже занят" };

  const { data: created, error } = await db
    .from("app_users")
    .insert({ login: newLogin, password, role: "user", name: newLogin })
    .select("login, password, role, name")
    .single();
  if (error || !created) {
    // 23505 — логин заняли между проверкой и вставкой
    const taken = error?.code === "23505";
    return { success: false, message: taken ? "Такой логин уже занят" : "Не удалось зарегистрироваться" };
  }

  return { success: true, role: created.role, name: created.name, token: await issueToken(created) };
}

// Журнал изменений — только для администратора
const ADMIN_ACTIONS = new Set([
  "getActivity",
  "getActivityItem",
  "updateActivity",
  "deleteActivity",
  "restoreActivity",
  "deleteAccount",
  "deleteGame",
  "gptAccounts",
  "phoneTasks",
]);

function slotFieldForBase(base: string) {
  if (base === "PS4 П3") return "slot4";
  if (base === "PS4 П2") return "slot5";
  if (base === "PS5 П2" || base === "П2") return "slot3";
  return null;
}

// preferredField — точный слот (slot1..slot5): при возврате освобождаем слот именно этого клиента.
// Без него для П3 работает прежнее правило (занимаем первый свободный, освобождаем второй).
async function applySlot(row: any, slotName: string, preferredField = "") {
  const isReturn = slotName.toLowerCase().indexOf("возврат") !== -1;
  const base = slotName.replace(/возврат\s*/i, "").trim();
  const valToSet = !isReturn;

  let targetField: string | null = null;
  const isP3 = base === "PS5 П3" || base === "П3";
  const allowedFields = isP3 ? ["slot1", "slot2"] : [slotFieldForBase(base)];

  if (preferredField && allowedFields.includes(preferredField)) {
    targetField = preferredField;
  } else if (isP3) {
    const d = toBool(row.slot1);
    const e = toBool(row.slot2);
    if (isReturn) {
      if (d && e) targetField = "slot2";
      else if (e) targetField = "slot2";
      else if (d) targetField = "slot1";
      else throw new Error("Оба слота П3 уже свободны!");
    } else {
      if (d && e) throw new Error("Оба слота П3 уже заняты!");
      else if (d) targetField = "slot2";
      else targetField = "slot1";
    }
  } else {
    targetField = slotFieldForBase(base);
  }

  if (!targetField) throw new Error("Неизвестный тип слота: " + base);

  const current = toBool(row[targetField]);
  if (current === valToSet) {
    const statusTxt = valToSet ? "ЗАНЯТ" : "СВОБОДЕН";
    throw new Error(
      "Слот " + base + " уже " + statusTxt +
        " в таблице! Заказ записан, но отметка не изменилась.",
    );
  }

  const patch: Record<string, boolean> = {};
  patch[targetField] = valToSet;
  const { error } = await db.from("accounts").update(patch).eq("id", row.id);
  if (error) throw new Error(error.message);

  return { accountId: row.id, field: targetField, value: valToSet };
}

async function findAccountByLogin(loginValue: string) {
  const target = loginValue.trim().toLowerCase();
  const { data } = await db
    .from("accounts")
    .select("*")
    .ilike("login", target);
  if (!data || data.length === 0) return null;
  const games = data.filter((r: any) => r.kind === "игры");
  return games[0] ?? data[0];
}

async function isSubscriptionName(name: string) {
  const { data } = await db
    .from("catalog_items")
    .select("id")
    .eq("type", "подписки")
    .eq("name", name.trim())
    .maybeSingle();
  return !!data;
}

// Возвращает удалённые строки, чтобы их можно было восстановить при отмене
async function clearEmptyAccount(loginValue: string) {
  const { data } = await db
    .from("empty_accounts")
    .delete()
    .ilike("email", loginValue.trim().toLowerCase())
    .select("email, region, status, is_problem");
  return data ?? [];
}

// track заполняется даже при ошибке слота: что создали и какой слот поменяли
async function allocateSlot(
  loginValue: string,
  gameName: string,
  edition: string,
  slotStr: string,
  expense: string,
  currency: string,
  purchaseDate: string,
  track: { slot?: any; createdAccountId?: string } = {},
  slotField = "",
) {
  const found = await findAccountByLogin(loginValue);

  if (found) {
    track.slot = await applySlot(found, slotStr, slotField);
    return;
  }

  const isReturn = slotStr.toLowerCase().indexOf("возврат") !== -1;
  if (isReturn) return;

  const kind = (await isSubscriptionName(gameName)) ? "подписки" : "игры";

  let fiat = 0;
  let rate = 1;
  let currencyValue = "";
  if (expense && expense !== "") {
    rate = await getRate(currency);
    fiat = parseFloat(String(expense).replace(",", ".")) || 0;
    currencyValue = currency || "";
  }

  const { data: inserted, error } = await db
    .from("accounts")
    .insert({
      kind,
      game_name: gameName,
      edition,
      login: loginValue,
      slot1: false,
      slot2: false,
      slot3: false,
      slot4: false,
      slot5: false,
      purchase_date: expense ? purchaseDate : null,
      expense_fiat: fiat,
      currency: currencyValue,
      rate,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  track.createdAccountId = inserted.id;
  track.slot = await applySlot(inserted, slotStr);
}

async function handleAddGame(data: any) {
  const rawType = (data.type ?? "").toString().toLowerCase().trim();
  const isSub = rawType.indexOf("подп") !== -1;
  const type = isSub ? "подписки" : "игры";
  const name = (data.name ?? "").trim();

  const editions = (data.editions ?? []).filter(
    (e: string) => e && e.trim() !== "",
  );

  let coverUrl = (data.coverUrl ?? "").trim();
  if (!coverUrl && type === "игры") {
    coverUrl = await getPSImageUrl(name);
  }

  const { data: inserted, error } = await db
    .from("catalog_items")
    .insert({
      type,
      name,
      has_ps5: data.hasPS5 !== undefined ? data.hasPS5 : true,
      has_ps4: data.hasPS4 !== undefined ? data.hasPS4 : true,
      cover_url: coverUrl,
      editions,
    })
    .select("id")
    .single();

  if (error) return json({ error: error.message });

  await logActivity(
    "game",
    "game_add",
    isSub ? "Добавлена подписка" : "Добавлена игра",
    {
      details: editions.length ? `${name} · ${editions.join(", ")}` : name,
      gameName: name,
      actor: data.actor,
      refId: inserted.id,
    },
  );

  await sendTG(
    "🎮 <b>ДОБАВЛЕНА НОВАЯ " + (isSub ? "ПОДПИСКА" : "ИГРА") +
      "</b>\n\nНазвание: " + name,
  );
  return json({ success: true });
}

async function handleBackfillCovers() {
  const { data: rows } = await db
    .from("catalog_items")
    .select("id, name, cover_url")
    .eq("type", "игры");

  let updated = 0;
  const failed: string[] = [];

  for (const row of rows ?? []) {
    if ((row.cover_url ?? "").trim() !== "") continue;
    const url = await getPSImageUrl(row.name ?? "");
    if (url) {
      await db.from("catalog_items").update({ cover_url: url }).eq("id", row.id);
      updated++;
    } else {
      failed.push(row.name ?? "");
    }
  }

  if (updated > 0) {
    await logActivity("game", "covers", "Подтянуты обложки", {
      details: `Обновлено: ${updated}`,
    });
  }

  return json({ success: true, updated, failed });
}

// Ключ прайса: "Издание|PS5|П3"
function renamePriceEdition(prices: any, oldEdition: string, newEdition: string) {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(prices ?? {})) {
    const [edition, ...rest] = key.split("|");
    const newKey = edition === oldEdition ? [newEdition, ...rest].join("|") : key;
    result[newKey] = value as number;
  }
  return result;
}

async function handleUpdatePrices(data: any) {
  const g = await fetchRef("catalog_items", data.id);
  if (!g) return json({ success: false, error: "Игра не найдена" });

  const prices: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.prices ?? {})) {
    const price = parsePrice(value);
    if (price !== null && price > 0) prices[key] = price;
  }

  const { error } = await db
    .from("catalog_items")
    .update({ prices })
    .eq("id", g.id);
  if (error) return json({ success: false, error: error.message });

  await logActivity("game", "prices_update", "Изменены цены", {
    details: g.name,
    gameName: g.name,
    actor: data.actor,
    refId: g.id,
    undo: { before: g.prices ?? {} },
  });
  return json({ success: true, prices });
}

// Цены обычных подписок. Раздел — "playstation|ua|psplus", ключ цены — "Essential|1"
const STANDARD_KEY = /^[a-z]+\|[a-z]+\|[a-z]+$/;
// Ключ цены: "тариф|месяцев" — всё остальное (например, "undefined|undefined") отбрасываем
const STANDARD_PRICE_KEY = /^[A-Za-z][A-Za-z ]*\|\d+$/;

async function handleUpdateStandardPrices(data: any) {
  const key = str(data.key);
  if (!STANDARD_KEY.test(key)) return json({ success: false, error: "Неизвестный раздел" });

  const prices: Record<string, number> = {};
  for (const [priceKey, value] of Object.entries(data.prices ?? {})) {
    if (!STANDARD_PRICE_KEY.test(priceKey) || priceKey.startsWith("undefined|")) continue;
    const price = parsePrice(value);
    if (price !== null && price > 0) prices[priceKey] = price;
  }

  const { data: before } = await db
    .from("standard_prices")
    .select("prices")
    .eq("key", key)
    .maybeSingle();
  const { data: row, error } = await db
    .from("standard_prices")
    .upsert({ key, prices, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("id")
    .single();
  if (error) return json({ success: false, error: error.message });

  await logActivity("game", "standard_prices_update", "Изменены цены подписок", {
    details: str(data.label).slice(0, 100) || key,
    actor: data.actor,
    refId: row.id,
    undo: { before: before?.prices ?? {} },
  });
  return json({ success: true, prices });
}

// Вкладка «CDK»: подписки ChatGPT оформляет сервис ZovoCard по кодам CDK. Сервер сам берёт код
// (неиспользованный с аккаунта или покупает новый), активирует его токеном клиента и следит за заказом.
// Статусы заказа у ZovoCard: completed — успех; три статуса ниже — окончательный отказ; остальные — в работе
const CDK_REJECTED = new Set(["declined", "failed_precharge", "cancelled"]);
const CDK_ORDERS_LIMIT = 50;
// Адреса активации по коду — без ключа, но привязаны к IP и устройству: ходим на них через тот же прокси
const ZOVO_CDK_PUBLIC = "https://zovocard.com/api/v1/cdk";
// Проверка аккаунта клиента у ZovoCard небыстрая: ждём дольше обычного
const ZOVO_TIMEOUT_MS = 60_000;

function cdkOrderStatus(zovoStatus: string) {
  if (zovoStatus === "completed") return "success";
  return CDK_REJECTED.has(zovoStatus) ? "rejected" : "pending";
}

// Тариф в приложении ("Pro|20") → название тарифа у ZovoCard
const CDK_PLANS: Record<string, string> = {
  "Go|1": "go",
  "Plus|1": "plus",
  "Pro|5": "pro_5x",
  "Pro|20": "pro_20x",
  "Pro|50": "pro_50x",
};

const CDK_PLAN_LABELS: Record<string, string> = {
  go: "ChatGPT Go",
  plus: "ChatGPT Plus",
  pro_5x: "ChatGPT Pro 5x",
  pro_20x: "ChatGPT Pro 20x",
  pro_50x: "ChatGPT Pro 50x",
};

// Текст ошибки у ZovoCard на китайском, поэтому переводим по коду ошибки
const ZOVO_ERRORS: Record<string, string> = {
  GPT_SESSION_INVALID: "Токен клиента недействителен или устарел",
  GPT_PLAN_ALREADY_ACTIVE: "У клиента ещё действует подписка",
  PRECHECK_REJECTED: "Аккаунт клиента не прошёл проверку",
  GPT_PRICE_UNCONFIRMED: "Цена не подтверждена, попробуйте ещё раз",
  INSUFFICIENT_BALANCE: "Недостаточно средств на балансе ZovoCard",
  RECHARGE_REQUIRED: "На аккаунте ZovoCard нет зачисленного пополнения",
  CDK_UNAVAILABLE: "Код CDK уже использован или обрабатывается",
  CDK_NOT_ACCESSIBLE: "Код CDK недоступен этому ключу ZovoCard",
  REDEMPTION_SESSION_INVALID: "Сессия активации истекла, попробуйте ещё раз",
  REDEMPTION_REJECTED: "Сервис отклонил активацию",
  GPT_PREFLIGHT_RATE_LIMITED: "Слишком много проверок, подождите минуту",
  DIRECT_PRODUCT_DISABLED: "Сервис активации временно недоступен",
  GPT_DIRECT_UNAVAILABLE: "Сервис активации временно недоступен",
  GPT_DIRECT_PAUSED: "Сервис активации приостановлен",
  GPT_DIRECT_ACCESS_DENIED: "У ключа ZovoCard нет доступа к оформлению подписок",
  API_SCOPE_UNAVAILABLE: "Ключу ZovoCard запрещено это действие",
};

// detail — текст сетевой ошибки, когда запрос не дошёл (status 0)
type ZovoReply = { ok: boolean; status: number; errorCode: string; data: any; detail?: string };

function zovoError(reply: ZovoReply, fallback: string) {
  if (ZOVO_ERRORS[reply.errorCode]) return ZOVO_ERRORS[reply.errorCode];
  if (reply.status === 429) return "Слишком много запросов, подождите минуту";
  return reply.errorCode ? `${fallback} (${reply.errorCode})` : `${fallback} (ответ ${reply.status})`;
}

// Запрос к ZovoCard через свой прокси. Сетевую ошибку отдаём как status 0 — «неизвестно, дошло ли»
async function zovoRequest(
  method: "GET" | "POST",
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<ZovoReply> {
  try {
    const { status, text } = await fetchViaProxy(
      new URL(url),
      method,
      { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body ? JSON.stringify(body) : "",
      ZOVO_PROXY_URL,
      ZOVO_TIMEOUT_MS,
    );
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch (_e) {
      parsed = {};
    }
    return {
      ok: status >= 200 && status < 300 && parsed.code === 0,
      status,
      errorCode: str(parsed.error_code),
      data: parsed.data ?? {},
    };
  } catch (e) {
    return { ok: false, status: 0, errorCode: "", data: {}, detail: e instanceof Error ? e.message : String(e) };
  }
}

// Запрос к API владельца (по ключу)
function zovoOwner(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) {
  return zovoRequest(method, `${ZOVOCARD_API}${path}`, body, { "X-API-Key": ZOVOCARD_API_KEY, ...headers });
}

// Последний сбой запроса к ZovoCard — чтобы показать на экране, почему нет баланса и карт,
// а не молча прятать их
// ipBlocked — отказ 403 без кода ошибки: так ZovoCard отвечает, когда адрес сервера не в списке
// разрешённых IP у ключа
let zovoLastFailure: { at: number; text: string; ipBlocked: boolean } | null = null;

// С какого адреса наши запросы приходят в ZovoCard: спрашиваем у внешнего сервиса через тот же прокси.
// Этот адрес и нужно добавить в список разрешённых IP ключа. Пусто — узнать не удалось
async function zovoOutgoingIp() {
  try {
    const { status, text } = await fetchViaProxy(
      new URL("https://api.ipify.org/"),
      "GET",
      { Accept: "text/plain" },
      "",
      ZOVO_PROXY_URL,
      10_000,
    );
    const ip = text.trim();
    return status === 200 && /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : "";
  } catch (_e) {
    return "";
  }
}

function zovoFailureText(reply: ZovoReply) {
  if (reply.status === 0) {
    return `нет связи с ZovoCard (прокси или сеть)${reply.detail ? `: ${reply.detail}` : ""}`;
  }
  if (reply.status === 429) return "ZovoCard ограничил частоту запросов (429)";
  if (reply.status === 401 || reply.status === 403) {
    return `ZovoCard отказал в доступе (${reply.status}${reply.errorCode ? ` ${reply.errorCode}` : ""})`;
  }
  return `ZovoCard ответил ошибкой ${reply.status}${reply.errorCode ? ` ${reply.errorCode}` : ""}`;
}

// GET к API владельца; возвращает поле data. null — ключ или прокси не настроены
async function zovoGet(path: string): Promise<any | null> {
  if (!ZOVOCARD_API_KEY || !ZOVO_PROXY_URL) return null;
  const reply = await zovoOwner("GET", path);
  if (!reply.ok) {
    zovoLastFailure = {
      at: Date.now(),
      text: `${zovoFailureText(reply)} — ${path.split("?")[0]}`,
      ipBlocked: reply.status === 403 && !reply.errorCode,
    };
    throw new Error(`ZovoCard ответил ${reply.status}`);
  }
  return reply.data;
}

// Последние заказы по CDK у ZovoCard
async function zovoCdkOrders(): Promise<any[] | null> {
  const data = await zovoGet(`/gpt-direct/cdk-orders?page_size=${CDK_ORDERS_LIMIT}`);
  if (!data) return null;
  return Array.isArray(data.list) ? data.list : [];
}

// Баланс ZovoCard: показываем доступное к расходу (spendable_balance), а не общий — часть общего
// удержана как резерв. null — не настроено или не получилось узнать
async function zovoBalance(): Promise<{ amount: number; currency: string } | null> {
  try {
    const data = await zovoGet("/balance");
    const amount = Number(data?.spendable_balance);
    return data && Number.isFinite(amount) ? { amount, currency: str(data.currency) } : null;
  } catch (_e) {
    return null;
  }
}

// Активные карты ZovoCard с балансом: с них оплачиваются подписки. Наружу отдаём только последние
// четыре цифры — полный номер и CVV из ответов ZovoCard дальше сервера не идут.
// exhausted — у карты кончился лимит оформлений: ZovoCard её больше не выберет, можно удалять.
// Держим полминуты: историю страница обновляет каждые 10 секунд
// payments — сколько успешных оформлений прошло с карты; null — посчитать не удалось.
// minRecharge — наименьшая сумма пополнения карты; null — ZovoCard её не назвал
type CdkCard = {
  last4: string;
  balance: number;
  exhausted: boolean;
  payments: number | null;
  minRecharge: number | null;
};
// Минимальное пополнение у карты не меняется — запоминаем по id карты, чтобы не спрашивать каждый раз
const cdkMinRecharge = new Map<number, number>();

// Минимальная сумма по карточным продуктам: {product_code → min_amount}. Запасной источник минимального
// пополнения для карт, у которых своё значение не заполнено. Продукты не меняются — спрашиваем один раз
let cdkProductMins: Map<string, number> | null = null;
async function zovoProductMins() {
  if (cdkProductMins) return cdkProductMins;
  const mins = new Map<string, number>();
  try {
    const data = await zovoGet("/products");
    for (const p of Array.isArray(data) ? data : (data?.list ?? [])) {
      const min = Number(p.min_amount);
      if (p.product_code && Number.isFinite(min) && min > 0) mins.set(str(p.product_code), min);
    }
    if (mins.size > 0) cdkProductMins = mins;
  } catch (_e) {
    // не узнали — у карты останется то, что отдал ZovoCard
  }
  return mins;
}

function cardMinRecharge(card: any): number | null {
  const value = Number(card?.min_recharge);
  return card?.min_recharge !== undefined && card?.min_recharge !== null && Number.isFinite(value) ? value : null;
}
const CDK_CARDS_TTL_MS = 30_000;
const CDK_CARDS_MAX = 8;
let cdkCardsCache: { at: number; cards: CdkCard[] } | null = null;

// Остался ли у карты лимит оформлений GPT. remaining: -1 — без лимита, 0 — исчерпан.
// Не узнали — считаем, что лимит есть: красным карту красим только наверняка
async function isCardExhausted(cardId: unknown): Promise<boolean> {
  try {
    const usage = await zovoGet(`/gpt-direct/cards/${cardId}/usage?product=gpt`);
    return usage?.remaining !== undefined && usage.remaining !== null && Number(usage.remaining) === 0;
  } catch (_e) {
    return false;
  }
}

// Лимит ZovoCard на карту: 5 обычных подписок (Go, Plus) или 3 Pro
const CARD_LIGHT_MAX = 5;
const CARD_PRO_MAX = 3;
// Сколько страниц заказов (по 100) просматриваем, считая оформления по картам
const CARD_USES_PAGES = 10;
// Счёт оформлений по картам держим три минуты: это несколько запросов к ZovoCard, а меняется он редко
const CARD_USES_TTL_MS = 180_000;
let cdkCardUsesCache: { at: number; uses: Map<number, { light: number; pro: number }> } | null = null;

// Сколько успешных оформлений прошло с каждой карты: {id карты → обычных и Pro}. Считаем сами по заказам
// аккаунта из всех источников (сайт, API, CDK): остаток лимита от ZovoCard приходит не всегда.
// Не получилось — null: неполный счёт не показываем
async function zovoCardUses() {
  if (cdkCardUsesCache && Date.now() - cdkCardUsesCache.at < CARD_USES_TTL_MS) return cdkCardUsesCache.uses;
  const uses = new Map<number, { light: number; pro: number }>();
  try {
    let query = "page_size=100";
    for (let page = 0; page < CARD_USES_PAGES; page++) {
      const data = await zovoGet(`/gpt-direct/account-orders?${query}`);
      for (const o of data?.list ?? []) {
        if (str(o.status) !== "completed" || !o.card_id) continue;
        const card = uses.get(Number(o.card_id)) ?? { light: 0, pro: 0 };
        if (str(o.plan).startsWith("pro")) card.pro++;
        else card.light++;
        uses.set(Number(o.card_id), card);
      }
      if (!data?.has_more || !data.next_cursor) break;
      query = `cursor=${encodeURIComponent(str(data.next_cursor))}&page_size=100`;
    }
  } catch (_e) {
    return null;
  }
  cdkCardUsesCache = { at: Date.now(), uses };
  return uses;
}

async function zovoCards(): Promise<CdkCard[] | null> {
  if (cdkCardsCache && Date.now() - cdkCardsCache.at < CDK_CARDS_TTL_MS) return cdkCardsCache.cards;
  try {
    const data = await zovoGet("/cards?status=ACTIVE&page_size=100");
    if (!data) return null;
    const uses = await zovoCardUses();
    // Старая карта слева, новая справа: номера карт у ZovoCard растут по порядку выпуска.
    // Если карт больше, чем помещается, показываем самые новые
    const list = [...(data.list ?? [])].sort((a, b) => Number(a.id) - Number(b.id)).slice(-CDK_CARDS_MAX);
    const cards: CdkCard[] = [];
    for (const c of list) {
      let balance = Number(c.available_amount ?? c.balance);
      let number = str(c.card_last_four || c.card_number);
      let minRecharge = cdkMinRecharge.get(Number(c.id)) ?? cardMinRecharge(c);
      let productCode = str(c.product_code);
      // В списке баланса или минимального пополнения может не быть (или там 0 вместо настоящего
      // значения) — тогда смотрим данные самой карты
      if (!Number.isFinite(balance) || !minRecharge) {
        const detail = await zovoGet(`/cards/${c.id}`).catch(() => null);
        if (!Number.isFinite(balance)) {
          balance = Number(detail?.available_amount);
          number = number || str(detail?.card_number);
        }
        minRecharge = cardMinRecharge(detail) ?? minRecharge;
        productCode = productCode || str(detail?.product_code);
      }
      // У карты минимум так и не указан (ZovoCard отдаёт 0) — берём минимальную сумму её карточного продукта
      if (!minRecharge) minRecharge = (await zovoProductMins()).get(productCode) ?? minRecharge;
      if (minRecharge) cdkMinRecharge.set(Number(c.id), minRecharge);
      if (Number.isFinite(balance)) {
        const used = uses?.get(Number(c.id)) ?? { light: 0, pro: 0 };
        const overLimit = used.light >= CARD_LIGHT_MAX || used.pro >= CARD_PRO_MAX;
        cards.push({
          last4: number.slice(-4),
          balance,
          exhausted: overLimit || (await isCardExhausted(c.id)),
          payments: uses ? used.light + used.pro : null,
          minRecharge,
        });
      }
    }
    cdkCardsCache = { at: Date.now(), cards };
    return cards;
  } catch (_e) {
    // ZovoCard не ответил — показываем карты, какими видели их в прошлый раз, а не прячем
    return cdkCardsCache?.cards ?? null;
  }
}

// Сколько единиц валюты в одном долларе: {"PHP": 62.75}. ZovoCard называет цены в валюте региона
// (для GPT — песо), а в доллары мы переводим сами по рыночному курсу; курс обновляется раз в сутки
const USD_RATES_URL = "https://open.er-api.com/v6/latest/USD";
const USD_RATES_TTL_MS = 6 * 60 * 60_000;
let usdRatesCache: { at: number; rates: Record<string, number> } | null = null;

async function usdRates(): Promise<Record<string, number>> {
  if (usdRatesCache && Date.now() - usdRatesCache.at < USD_RATES_TTL_MS) return usdRatesCache.rates;
  try {
    const body = await (await fetch(USD_RATES_URL)).json();
    if (body.result === "success" && body.rates) usdRatesCache = { at: Date.now(), rates: body.rates };
  } catch (_e) {
    // Курс не узнали — отдадим прошлый, если он был
  }
  return usdRatesCache?.rates ?? {};
}

// Цены подписок GPT у ZovoCard по тарифам: {"plus": {amount, currency, amountUsd, feeUsd, available}}.
// Это ориентир: точную сумму ZovoCard называет при проверке аккаунта, а списывает по своему курсу.
// Меняются редко, поэтому держим 5 минут
type CdkPrice = { amount: number; currency: string; amountUsd: number | null; feeUsd: number; available: boolean };
const CDK_PRICES_TTL_MS = 5 * 60_000;
let cdkPricesCache: { at: number; prices: Record<string, CdkPrice> } | null = null;

async function zovoPrices(): Promise<Record<string, CdkPrice> | null> {
  if (cdkPricesCache && Date.now() - cdkPricesCache.at < CDK_PRICES_TTL_MS) return cdkPricesCache.prices;
  try {
    const [data, rates] = await Promise.all([zovoGet("/gpt-direct/plans?product=gpt"), usdRates()]);
    if (!data) return null;
    const prices: Record<string, CdkPrice> = {};
    for (const r of data.registry ?? []) {
      const plan = data.plans?.[r.acc_plan_key ?? r.key];
      // Суммы приходят в минорных единицах (сентаво для PHP, центы для USD)
      const amount = Number(plan?.expectedAmountMinor ?? r.checkout_amount_minor ?? 0) / 100;
      const currency = str(plan?.currency ?? r.checkout_currency);
      const rate = currency === "USD" ? 1 : Number(rates[currency]);
      prices[str(r.key)] = {
        amount,
        currency,
        amountUsd: rate > 0 ? amount / rate : null,
        feeUsd: Number(r.service_fee_usd_minor ?? plan?.serviceFeeUsdMinor ?? 0) / 100,
        // Купить можно, только если тариф открыт и в реестре, и у исполнителя
        available: r.purchasable === true && plan?.enabled === true,
      };
    }
    cdkPricesCache = { at: Date.now(), prices };
    return prices;
  } catch (_e) {
    return null;
  }
}

// Сколько потрачено на успешный заказ, в долларах: подписка (ZovoCard называет сумму в валюте региона,
// переводим по сегодняшнему рыночному курсу) плюс сервисный сбор. null — заказ не оплачен или курса нет
function cdkSpentUsd(z: any, rates: Record<string, number>): number | null {
  if (str(z.status) !== "completed") return null;
  const amount = Number(z.final_amount_minor) / 100;
  const currency = str(z.currency);
  const rate = currency === "USD" ? 1 : Number(rates[currency]);
  if (!(amount > 0) || !(rate > 0)) return null;
  return amount / rate + (Number(z.service_fee_minor) || 0) / 100;
}

// Причина отказа по статусу заказа у ZovoCard — известна всегда
const CDK_REJECT_REASONS: Record<string, string> = {
  declined: "Оплата не прошла",
  failed_precharge: "Не удалось подготовить оплату",
  cancelled: "Заказ отменён",
};
// Подробности отказа лежат в данных самого заказа у ZovoCard. Отклонённый заказ уже не меняется —
// запоминаем по его номеру; за один запрос истории спрашиваем не больше нескольких новых
const CDK_REJECT_FETCH = 5;
const cdkRejectDetails = new Map<number, any>();

async function loadCdkRejectDetails(orderIds: number[]) {
  const missing = orderIds.filter((id) => id && !cdkRejectDetails.has(id)).slice(0, CDK_REJECT_FETCH);
  await Promise.all(
    missing.map(async (id) => {
      try {
        const detail = await zovoGet(`/gpt-direct/cdk-orders/${id}`);
        if (detail) cdkRejectDetails.set(id, detail);
      } catch (_e) {
        // без подробностей останется причина по статусу
      }
    }),
  );
}

// Поиск поля в данных отклонённого заказа: сам заказ из списка, он же из подробностей, затем события
// с последнего
function cdkRejectLookup(z?: any) {
  const detail = cdkRejectDetails.get(Number(z?.order_id));
  const sources = [z, detail?.order, ...[...(detail?.events ?? [])].reverse()].filter(Boolean);
  return (...keys: string[]) => {
    for (const source of sources) {
      for (const key of keys) {
        const value = str(source[key]);
        if (value) return value;
      }
    }
    return "";
  };
}

// Почему заказ отклонён: причина по статусу и подробности — код ошибки, пояснение и этап, на котором
// остановилось. Пояснения на китайском не показываем: вместо них код ошибки (переведённый, если знаем перевод)
function cdkRejectReason(zovoStatus: string, z?: any) {
  if (!CDK_REJECTED.has(zovoStatus)) return "";
  const first = cdkRejectLookup(z);
  const code = first("error_code", "failure_code", "decline_code", "fail_code");
  const text = first("user_message", "failure_reason", "decline_reason", "fail_reason", "error_message", "message");
  const stage = first("stage");

  const explained = ZOVO_ERRORS[code] ?? (/[㐀-鿿]/.test(text) ? "" : text);
  const notes = [ZOVO_ERRORS[code] ? "" : code, stage && stage !== zovoStatus ? `этап: ${stage}` : ""].filter(Boolean);
  return (
    [CDK_REJECT_REASONS[zovoStatus], explained].filter(Boolean).join(": ") +
    (notes.length > 0 ? ` (${notes.join(", ")})` : "")
  );
}

// Заказ, которого нет в нашей таблице (оформлен на сайте ZovoCard): почта там замаскирована,
// а от кода есть только начало
function cdkExternalView(z: any, rates: Record<string, number>) {
  const plan = str(z.plan);
  return {
    id: `zovo-${z.order_id}`,
    label: CDK_PLAN_LABELS[plan] ?? plan,
    email: str(z.account_email),
    code: `${str(z.code_prefix)}…`,
    status: cdkOrderStatus(str(z.status)),
    reason: cdkRejectReason(str(z.status), z),
    renewalStatus: str(z.renewal_status),
    spentUsd: cdkSpentUsd(z, rates),
    createdAt: z.created_at,
  };
}

// z — этот же заказ у ZovoCard, если он попал в последние: оттуда автопродление и потраченная сумма
function cdkOrderView(o: any, z?: any, rates: Record<string, number> = {}) {
  return {
    id: o.id,
    label: o.label,
    email: o.email,
    code: o.code,
    status: o.status,
    // Почему отклонён. Заказа нет среди последних у ZovoCard — подробности ищем по его номеру
    reason: cdkRejectReason(str(o.zovo_status), z ?? { order_id: o.zovo_order_id }),
    // Удалось ли ZovoCard отключить автопродление: warning / manual_required — нужно отключить вручную
    renewalStatus: z ? str(z.renewal_status) : "",
    spentUsd: z ? cdkSpentUsd(z, rates) : null,
    // Кто оформил заказ
    actor: o.actor ?? "",
    createdAt: o.created_at,
  };
}

// Код CDK для заказа: сначала неиспользованный с аккаунта (оставшийся от прошлой неудачной попытки
// или купленный на сайте), иначе покупаем новый — за него ZovoCard берёт сервисный сбор
async function takeCdkCode(plan: string, orderId: string): Promise<{ code: string } | { error: string }> {
  const unused = await zovoOwner("GET", `/gpt-direct/cdks?status=unused&plan=${plan}&page_size=20`);
  if (unused.ok) {
    // Полный код у старых записей может не отдаваться — такие пропускаем
    const ready = (unused.data.list ?? []).find(
      (c: any) => str(c.plan) === plan && str(c.status || "unused") === "unused" && str(c.code).length > str(c.code_prefix).length,
    );
    if (ready) return { code: str(ready.code) };
  }

  const issued = await zovoOwner(
    "POST",
    "/gpt-direct/cdks",
    { plan, count: 1, funding_confirmed: true },
    // С одним ключом повтор запроса не купит второй код
    { "Idempotency-Key": `mrcrm-cdk-${orderId}` },
  );
  const code = str(issued.data?.issued?.[0]?.code);
  if (!issued.ok || !code) return { error: zovoError(issued, "Не удалось купить код CDK") };
  return { code };
}

// Оформление подписки: проверяем токен клиента, берём код, активируем его и записываем заказ.
// Токен клиента только пересылается в ZovoCard — в базе и журнале он не сохраняется
async function redeemCdk(data: any) {
  if (!ZOVOCARD_API_KEY || !ZOVO_PROXY_URL) {
    return json({ success: false, error: "ZovoCard не настроен на сервере" });
  }
  const product = str(data.product);
  const plan = CDK_PLANS[product];
  if (!plan) return json({ success: false, error: "Неизвестный тариф" });
  const session = str(data.session);
  if (!session) return json({ success: false, error: "Нет токена клиента" });
  const label = CDK_PLAN_LABELS[plan];
  const email = str(data.email).slice(0, 200);
  const credential = { mode: "session", session };

  const id = crypto.randomUUID();
  const device = `mrcrm-${id}`;
  const deviceHeader = { "X-Redemption-Device": device };

  // 1. Бесплатная проверка токена — до покупки кода. Если ключу эта проверка запрещена (401/403)
  // или сеть подвела, идём дальше: токен ещё раз проверится на шаге 3
  const precheck = await zovoOwner("POST", "/gpt-direct/preflight", { product: "gpt", plan, credential });
  if (!precheck.ok && precheck.status >= 400 && precheck.status < 500 && ![401, 403].includes(precheck.status)) {
    return json({ success: false, error: zovoError(precheck, "Аккаунт клиента не прошёл проверку") });
  }

  // 2. Код
  const taken = await takeCdkCode(plan, id);
  if ("error" in taken) return json({ success: false, error: taken.error });
  const code = taken.code;
  // Начиная отсюда код уже есть на аккаунте: при любой неудаче он остаётся неиспользованным
  // и уйдёт на следующее оформление этого тарифа
  const kept = "Купленный код остался на аккаунте ZovoCard и будет использован в следующий раз.";

  // 3. Проверка кода и аккаунта клиента
  const preview = await zovoRequest("POST", `${ZOVO_CDK_PUBLIC}/preview`, { code }, deviceHeader);
  const redemptionToken = str(preview.data.redemption_token);
  if (!preview.ok || !redemptionToken) {
    return json({ success: false, error: `${zovoError(preview, "Сервис не принял код CDK")}. ${kept}` });
  }
  const preflight = await zovoRequest(
    "POST",
    `${ZOVO_CDK_PUBLIC}/preflight`,
    { redemption_token: redemptionToken, credential },
    deviceHeader,
  );
  const preflightToken = str(preflight.data.preflight_token);
  if (!preflight.ok || !preflightToken) {
    return json({ success: false, error: `${zovoError(preflight, "Аккаунт клиента не прошёл проверку")}. ${kept}` });
  }

  // 4. Запись заказа — до активации: если активация оборвётся, заказ не потеряется, статус подтянет сверка
  const { data: order, error } = await db
    .from("cdk_orders")
    .insert({ id, product, label, email, code, redemption_token: redemptionToken, device, actor: str(data.actorLogin) })
    .select("*")
    .single();
  if (error) return json({ success: false, error: `${error.message}. ${kept}` });

  // 5. Активация
  const redeem = await zovoOwner(
    "POST",
    "/gpt-direct/cdks/redeem",
    { redemption_token: redemptionToken, preflight_token: preflightToken, client_request_id: id },
    deviceHeader,
  );
  // Явный отказ (кроме 409 — там заказ мог уже существовать): заказа нет, запись убираем
  if (!redeem.ok && redeem.status >= 400 && redeem.status < 500 && redeem.status !== 409) {
    await db.from("cdk_orders").delete().eq("id", id);
    return json({ success: false, error: `${zovoError(redeem, "Сервис не принял заказ")}. ${kept}` });
  }

  const zovoStatus = str(redeem.data?.order?.status);
  if (redeem.ok && zovoStatus) {
    const patch = {
      zovo_status: zovoStatus,
      status: cdkOrderStatus(zovoStatus),
      zovo_order_id: Number(redeem.data.order.order_id) || null,
      updated_at: new Date().toISOString(),
    };
    await db.from("cdk_orders").update(patch).eq("id", id);
    Object.assign(order, patch);
  }

  await logActivity("game", "cdk_order", "Оформлена подписка ChatGPT", {
    details: [label, email, code].filter(Boolean).join(" · "),
    actor: data.actor,
  });
  return json({ success: true, order: cdkOrderView(order) });
}

// Раньше в заказ записывалось имя сотрудника («Администратор»), теперь — логин. Чтобы старые заказы
// не числились за отдельным человеком, имя переводим в логин: {имя → логин}
async function cdkActorLogins() {
  const { data } = await db.from("app_users").select("login, name, role");
  const logins = new Map<string, string>();
  // Логины с ролью gpt: по их оформлениям считается долг
  const gptLogins: string[] = [];
  for (const u of data ?? []) {
    if (u.name && u.name !== u.login) logins.set(u.name, u.login);
    if (u.role === "gpt") gptLogins.push(u.login);
  }
  return { logins, gptLogins };
}

// Сколько заказов отдаём за раз. Фильтры истории по дням и людям работают в браузере,
// поэтому сразу отдаём много: смена фильтра не ходит на сервер
const CDK_HISTORY_LIMIT = 1000;

// Подписка оформлена не через ZovoCard, а записана в долг вручную (страница «Долги»): кода у неё нет,
// вместо него эта пометка. В истории вкладки «CDK» такие записи не показываем
const CDK_MANUAL_CODE = "manual";

// Сколько рублей сотрудник с ролью gpt должен сверх закупочной цены за каждую оформленную подписку
const CDK_DEBT_MARKUP_RUB = 50;

// Курс USDT из шапки (общие настройки «Стандарт»); 0 — курс не задан
async function cdkUsdtRate(): Promise<number> {
  const { data } = await db.from("standard_prices").select("prices").eq("key", "rates|usdt|rub").maybeSingle();
  return Number((data?.prices as Record<string, unknown> | undefined)?.["rate|1"]) || 0;
}

// Долг за одно оформление тарифа (по его названию из заказа): закупочная цена ZovoCard со сбором
// по курсу USDT плюс наценка. null — цену или курс не знаем
function cdkDebtRub(label: string, prices: Record<string, CdkPrice> | null, usdtRate: number): number | null {
  const plan = Object.keys(CDK_PLAN_LABELS).find((key) => CDK_PLAN_LABELS[key] === label);
  const price = plan ? prices?.[plan] : undefined;
  if (!price || price.amountUsd == null || !(usdtRate > 0)) return null;
  return Math.round((price.amountUsd + price.feeUsd) * usdtRate) + CDK_DEBT_MARKUP_RUB;
}

// op: "list" — история заказов с балансом и ценами; "redeem" — оформить подписку
async function handleCdkOrders(data: any) {
  switch (data.op) {
    case "list": {
      // before — время самого старого из уже показанных заказов: тогда отдаём следующую, более старую страницу.
      // Берём на одну строку больше, чтобы знать, есть ли ещё
      const before = str(data.before);
      let query = db
        .from("cdk_orders")
        .select("*")
        .neq("code", CDK_MANUAL_CODE)
        .order("created_at", { ascending: false })
        .limit(CDK_HISTORY_LIMIT + 1);
      if (before) query = query.lt("created_at", before);
      const [{ data: found, error }, { logins, gptLogins }] = await Promise.all([query, cdkActorLogins()]);
      if (error) return json({ success: false, error: error.message });
      const hasMore = (found ?? []).length > CDK_HISTORY_LIMIT;
      const rows = (found ?? []).slice(0, CDK_HISTORY_LIMIT);
      for (const row of rows) row.actor = logins.get(str(row.actor)) ?? str(row.actor);

      // Старые страницы с ZovoCard не сверяем: он отдаёт только последние заказы
      if (before) return json({ success: true, hasMore, orders: rows.map((o) => cdkOrderView(o)) });

      // Сверяемся с ZovoCard: он знает настоящий статус каждого заказа. Не получилось — отдаём, что есть
      const startedAt = Date.now();
      // Что пошло не так с ZovoCard за этот запрос; пусто — всё получили
      const zovoIssue = async () => {
        if (!ZOVOCARD_API_KEY || !ZOVO_PROXY_URL) return "ZovoCard не настроен на сервере";
        if (!zovoLastFailure || zovoLastFailure.at < startedAt) return "";
        if (!zovoLastFailure.ipBlocked) return zovoLastFailure.text;
        const ip = await zovoOutgoingIp();
        return (
          `${zovoLastFailure.text}. Скорее всего, адрес сервера не в списке разрешённых IP у ключа ZovoCard` +
          (ip ? `; сейчас запросы идут с адреса ${ip}` : "")
        );
      };
      const [remote, balance, prices, rates, cards] = await Promise.all([
        zovoCdkOrders().catch(() => null),
        zovoBalance(),
        zovoPrices(),
        usdRates(),
        zovoCards(),
      ]);
      if (!remote) {
        return json({
          success: true,
          hasMore,
          balance,
          cards,
          prices,
          gptLogins,
          zovoIssue: await zovoIssue(),
          orders: rows.map((o) => cdkOrderView(o)),
        });
      }

      const matched = new Set<number>();
      // Наш заказ и он же у ZovoCard, если попал в последние
      const pairs: [any, any][] = [];
      for (const row of rows) {
        // Наш id заказа уходит в ZovoCard как client_request_id (сайт может добавить к нему приставку)
        const z = remote.find(
          (r) =>
            str(r.client_request_id).includes(row.id) ||
            (row.zovo_order_id && Number(r.order_id) === Number(row.zovo_order_id)),
        );
        if (z) {
          matched.add(Number(z.order_id));
          const zovoStatus = str(z.status);
          if (row.status === "pending" && zovoStatus && (zovoStatus !== row.zovo_status || !row.zovo_order_id)) {
            const patch = {
              zovo_status: zovoStatus,
              status: cdkOrderStatus(zovoStatus),
              zovo_order_id: Number(z.order_id),
              updated_at: new Date().toISOString(),
            };
            await db.from("cdk_orders").update(patch).eq("id", row.id).eq("status", "pending");
            Object.assign(row, patch);
          }
        }
        pairs.push([row, z]);
      }
      const external = remote.filter((z) => !matched.has(Number(z.order_id)));

      // Подробности отказов — до сборки списка: по ним считается причина. Новые заказы первыми
      await loadCdkRejectDetails([
        ...external.filter((z) => CDK_REJECTED.has(str(z.status))).map((z) => Number(z.order_id)),
        ...rows.filter((row) => CDK_REJECTED.has(str(row.zovo_status))).map((row) => Number(row.zovo_order_id)),
      ]);

      const orders = [
        ...pairs.map(([row, z]) => cdkOrderView(row, z, rates)),
        ...external.map((z) => cdkExternalView(z, rates)),
      ];
      orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return json({ success: true, hasMore, balance, cards, prices, gptLogins, zovoIssue: await zovoIssue(), orders });
    }
    case "debts": {
      // Для долга в шапке: только успешные оформления из нашей базы (кто, тариф, почта клиента)
      // и цены. Карты, баланс и сверку с ZovoCard не трогаем — поэтому отвечает быстро
      const PAGE = 1000;
      type DebtRow = {
        id: string; label: string; actor: string; email: string; code: string; created_at: string; debt_rub?: number | null;
      };
      // Колонки debt_rub ещё нет (миграция 0022 не применена) — читаем без неё, суммы не фиксируем
      let hasDebtColumn = true;
      const loadRows = async () => {
        const rows: DebtRow[] = [];
        for (let from = 0; ; from += PAGE) {
          const query = (columns: string) =>
            db
              .from("cdk_orders")
              .select(columns)
              .eq("status", "success")
              .order("created_at", { ascending: false })
              .range(from, from + PAGE - 1);
          let { data: page, error } = await query(
            hasDebtColumn ? "id, label, actor, email, code, created_at, debt_rub" : "id, label, actor, email, code, created_at",
          );
          if (error && hasDebtColumn && /debt_rub/.test(error.message)) {
            hasDebtColumn = false;
            ({ data: page, error } = await query("id, label, actor, email, code, created_at"));
          }
          if (error) throw new Error(error.message);
          rows.push(...((page ?? []) as unknown as DebtRow[]));
          if ((page ?? []).length < PAGE) return rows;
        }
      };
      try {
        const [rows, { logins, gptLogins }, prices, paid, usdtRate] = await Promise.all([
          loadRows(),
          cdkActorLogins(),
          zovoPrices(),
          // Выплаты долга. Таблицы ещё нет (миграция не применена) — считаем, что выплат не было
          db.from("cdk_debt_payments").select("id, login, amount, created_at").order("created_at", { ascending: false }),
          cdkUsdtRate(),
        ]);
        // Оформления без зафиксированной суммы долга (только что стали успешными) — фиксируем по
        // сегодняшним ценам и курсу. Дальше сумма хранится в заказе и от цен больше не зависит
        if (hasDebtColumn) {
          await Promise.all(
            rows
              .filter((row) => row.debt_rub == null)
              .map(async (row) => {
                const amount = cdkDebtRub(row.label, prices, usdtRate);
                if (amount == null) return;
                const { error } = await db.from("cdk_orders").update({ debt_rub: amount }).eq("id", row.id).is("debt_rub", null);
                if (!error) row.debt_rub = amount;
              }),
          );
        }
        const payments = (paid.data ?? []).map((row: any) => ({
          id: row.id,
          login: str(row.login),
          amount: Number(row.amount),
          createdAt: row.created_at,
        }));
        const orders = rows.map((row) => ({
          id: row.id,
          actor: logins.get(str(row.actor)) ?? str(row.actor),
          label: str(row.label),
          email: str(row.email),
          manual: row.code === CDK_MANUAL_CODE,
          // Зафиксированный долг за оформление, ₽; null — зафиксировать не удалось (нет цены или курса)
          amount: row.debt_rub == null ? null : Number(row.debt_rub),
          createdAt: row.created_at,
        }));
        return json({ success: true, orders, payments, gptLogins, prices: prices ?? {} });
      } catch (e) {
        return json({ success: false, error: (e as Error).message });
      }
    }
    case "debtPay": {
      // Сотрудник с ролью gpt отмечает, что отдал часть долга. Записываем на его логин из токена
      if (data.actorRole !== "gpt") return json({ success: false, error: "Отдавать долг может только сотрудник с ролью gpt" });
      const amount = Math.round(Number(data.amount));
      if (!(amount > 0)) return json({ success: false, error: "Укажите сумму" });
      const { error } = await db.from("cdk_debt_payments").insert({ login: str(data.actorLogin), amount });
      if (error) return json({ success: false, error: error.message });
      await logActivity("game", "cdk_debt_payment", "Отдан долг за подписки ChatGPT", {
        details: `${amount} ₽`,
        actor: data.actor,
      });
      return json({ success: true });
    }
    case "debtAdd": {
      // Подписку оформили в другом месте, но через нас: записываем её в долг вручную.
      // Админ записывает на любого сотрудника с ролью gpt, сам сотрудник — только на себя
      const product = str(data.product);
      const plan = CDK_PLANS[product];
      if (!plan) return json({ success: false, error: "Неизвестный тариф" });
      let login = str(data.actorLogin);
      if (data.actorRole === "admin") {
        const { gptLogins } = await cdkActorLogins();
        const target = str(data.login).toLowerCase();
        login = gptLogins.find((name) => name.toLowerCase() === target) ?? "";
        if (!login) return json({ success: false, error: "Выберите сотрудника с ролью gpt" });
      } else if (data.actorRole !== "gpt") {
        return json({ success: false, error: "Добавлять подписку в долг может админ или сотрудник с ролью gpt" });
      }
      const label = CDK_PLAN_LABELS[plan];
      const email = str(data.email).trim().slice(0, 200);
      const { error } = await db
        .from("cdk_orders")
        .insert({ product, label, email, code: CDK_MANUAL_CODE, status: "success", actor: login });
      if (error) return json({ success: false, error: error.message });
      await logActivity("game", "cdk_debt_manual", "Подписка ChatGPT добавлена в долг вручную", {
        details: [label, email, login].filter(Boolean).join(" · "),
        actor: data.actor,
      });
      return json({ success: true });
    }
    case "debtRemove": {
      // Убрать из долга подписку, добавленную вручную (например, записали по ошибке). Обычные оформления
      // не удаляются. Админ убирает любую такую запись, сотрудник с ролью gpt — только свою
      if (data.actorRole !== "admin" && data.actorRole !== "gpt") {
        return json({ success: false, error: "Удалять подписку из долга может админ или сотрудник с ролью gpt" });
      }
      const { data: row, error: findError } = await db
        .from("cdk_orders")
        .select("id, label, email, actor")
        .eq("id", str(data.id))
        .eq("code", CDK_MANUAL_CODE)
        .maybeSingle();
      if (findError) return json({ success: false, error: findError.message });
      if (!row) return json({ success: false, error: "Запись не найдена" });
      if (data.actorRole === "gpt" && str(row.actor).toLowerCase() !== str(data.actorLogin).toLowerCase()) {
        return json({ success: false, error: "Это запись другого сотрудника" });
      }
      const { error } = await db.from("cdk_orders").delete().eq("id", row.id).eq("code", CDK_MANUAL_CODE);
      if (error) return json({ success: false, error: error.message });
      await logActivity("game", "cdk_debt_manual_remove", "Подписка ChatGPT, добавленная вручную, удалена из долга", {
        details: [str(row.label), str(row.email), str(row.actor)].filter(Boolean).join(" · "),
        actor: data.actor,
      });
      return json({ success: true });
    }
    case "redeem":
      return await redeemCdk(data);
    default:
      return json({ success: false, error: "Неизвестное действие" });
  }
}

// Сохранённые аккаунты ChatGPT в разделе админа «Долги партнёров»: почта, пароль и ключ 2FA.
// op: "list" — все аккаунты, новые сверху; "add" — сохранить; "remove" — удалить
async function handleGptAccounts(data: any) {
  switch (data.op) {
    case "list": {
      const { data: rows, error } = await db
        .from("gpt_accounts")
        .select("id, email, password, totp, created_at")
        .order("created_at", { ascending: false });
      if (error) return json({ success: false, error: error.message });
      const accounts = (rows ?? []).map((row: any) => ({
        id: row.id,
        email: str(row.email),
        password: str(row.password),
        totp: str(row.totp),
        createdAt: row.created_at,
      }));
      return json({ success: true, accounts });
    }
    case "add": {
      const email = str(data.email).trim().slice(0, 200);
      const password = str(data.password).trim().slice(0, 200);
      // Ключ вставляют группами и в любом регистре — храним слитно и заглавными
      const totp = str(data.totp).replace(/[\s-]/g, "").toUpperCase().slice(0, 200);
      if (!email) return json({ success: false, error: "Укажите почту" });
      if (!password) return json({ success: false, error: "Укажите пароль" });
      // Сравниваем без учёта регистра; «_» и «%» в почте — обычные знаки, а не подстановки
      const pattern = email.replace(/[\\%_]/g, "\\$&");
      const { data: same } = await db.from("gpt_accounts").select("id").ilike("email", pattern).limit(1);
      if ((same ?? []).length > 0) return json({ success: false, error: "Аккаунт с такой почтой уже сохранён" });
      const { error } = await db.from("gpt_accounts").insert({ email, password, totp });
      if (error) return json({ success: false, error: error.message });
      // Пароль и ключ в журнал не пишем
      await logActivity("game", "gpt_account_add", "Сохранён аккаунт ChatGPT", { details: email, actor: data.actor });
      return json({ success: true });
    }
    case "remove": {
      const { data: row, error: findError } = await db
        .from("gpt_accounts")
        .select("id, email")
        .eq("id", str(data.id))
        .maybeSingle();
      if (findError) return json({ success: false, error: findError.message });
      if (!row) return json({ success: false, error: "Аккаунт не найден" });
      const { error } = await db.from("gpt_accounts").delete().eq("id", row.id);
      if (error) return json({ success: false, error: error.message });
      await logActivity("game", "gpt_account_remove", "Удалён сохранённый аккаунт ChatGPT", {
        details: str(row.email),
        actor: data.actor,
      });
      return json({ success: true });
    }
    default:
      return json({ success: false, error: "Неизвестное действие" });
  }
}

// ---------- Телефон с PS App ----------
// В разделе «Долги партнёров» админ просит войти в сохранённый аккаунт на телефоне или ввести код
// с экрана консоли. Сайт только создаёт задание; выполняет его программа на компьютере, к которому
// телефон подключён по USB (agent/phone-agent.mjs): она забирает задание и записывает итог.
const PHONE_AGENT_KEY = Deno.env.get("PHONE_AGENT_KEY") ?? "";
// Строка-отметка «программа на связи»: её время обновляется при каждом обращении программы
const PHONE_AGENT_ROW = "00000000-0000-0000-0000-000000000001";
// Программа спрашивает задания раз в несколько секунд; молчит дольше — считаем, что она не запущена
const PHONE_AGENT_ALIVE_MS = 30_000;
// Задание, которое никто не взял или не закончил за это время, считаем сорвавшимся
const PHONE_TASK_STALE_MS = 5 * 60_000;

function phoneTaskView(row: any) {
  if (!row) return null;
  const stale = Date.now() - new Date(row.updated_at).getTime() > PHONE_TASK_STALE_MS;
  const waiting = row.status === "pending" || row.status === "running";
  return {
    id: row.id,
    email: str(row.email),
    code: str(row.code),
    status: waiting && stale ? "error" : row.status,
    message: waiting && stale ? "Программа на компьютере не ответила" : str(row.message),
    createdAt: row.created_at,
  };
}

// op: "status" — последние задания и на связи ли программа; "login" — войти в аккаунт; "code" — ввести код консоли
async function handlePhoneTasks(data: any) {
  const lastOf = async (kind: string) => {
    const { data: rows } = await db
      .from("phone_tasks")
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1);
    return phoneTaskView(rows?.[0]);
  };
  switch (data.op) {
    case "status": {
      const [login, code, agent] = await Promise.all([
        lastOf("login"),
        lastOf("console_code"),
        db.from("phone_tasks").select("updated_at").eq("id", PHONE_AGENT_ROW).maybeSingle(),
      ]);
      if (agent.error) return json({ success: false, error: agent.error.message });
      const seen = agent.data?.updated_at ? new Date(agent.data.updated_at).getTime() : 0;
      return json({ success: true, login, code, agentOnline: Date.now() - seen < PHONE_AGENT_ALIVE_MS });
    }
    case "login": {
      const email = str(data.email).trim();
      if (!email) return json({ success: false, error: "Укажите почту" });
      const pattern = email.replace(/[\\%_]/g, "\\$&");
      const { data: found } = await db.from("gpt_accounts").select("email").ilike("email", pattern).limit(1);
      if (!found?.length) return json({ success: false, error: "Такого аккаунта нет среди сохранённых" });
      const { error } = await db
        .from("phone_tasks")
        .insert({ kind: "login", email: str(found[0].email), actor: str(data.actorLogin) });
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }
    case "code": {
      const code = str(data.code).replace(/\D/g, "");
      if (code.length < 6 || code.length > 8) return json({ success: false, error: "Код — от 6 до 8 цифр" });
      const { error } = await db.from("phone_tasks").insert({ kind: "console_code", code, actor: str(data.actorLogin) });
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }
    default:
      return json({ success: false, error: "Неизвестное действие" });
  }
}

// Обращения программы с компьютера: вместо входа — общий с ней ключ.
// op: "next" — отметиться и взять самое старое ждущее задание (для входа — вместе с паролем и ключом 2FA
// аккаунта); "finish" — записать итог задания
async function handlePhoneAgent(data: any) {
  if (!PHONE_AGENT_KEY || str(data.agentKey) !== PHONE_AGENT_KEY) {
    return json({ success: false, error: "Неверный ключ программы" }, 403);
  }
  const now = new Date().toISOString();
  switch (data.op) {
    case "next": {
      await db
        .from("phone_tasks")
        .upsert({ id: PHONE_AGENT_ROW, kind: "agent", status: "done", updated_at: now });
      // Старые задания не выполняем: их уже никто не ждёт
      const fresh = new Date(Date.now() - PHONE_TASK_STALE_MS).toISOString();
      const { data: rows, error } = await db
        .from("phone_tasks")
        .select("*")
        .eq("status", "pending")
        .neq("kind", "agent")
        .gt("created_at", fresh)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) return json({ success: false, error: error.message });
      const row = rows?.[0];
      if (!row) return json({ success: true, task: null });
      const { data: taken } = await db
        .from("phone_tasks")
        .update({ status: "running", updated_at: now })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id");
      if (!taken?.length) return json({ success: true, task: null });
      const task: Record<string, string> = { id: row.id, kind: row.kind, email: str(row.email), code: str(row.code) };
      if (row.kind === "login") {
        const { data: account } = await db
          .from("gpt_accounts")
          .select("password, totp")
          .ilike("email", str(row.email).replace(/[\\%_]/g, "\\$&"))
          .limit(1);
        task.password = str(account?.[0]?.password);
        task.totp = str(account?.[0]?.totp);
      }
      return json({ success: true, task });
    }
    case "finish": {
      const status = data.status === "done" ? "done" : "error";
      const { error } = await db
        .from("phone_tasks")
        .update({ status, message: str(data.message).slice(0, 500), updated_at: now })
        .eq("id", str(data.id));
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }
    default:
      return json({ success: false, error: "Неизвестное действие" });
  }
}

async function handleAddEdition(data: any) {
  const name = (data.gameName ?? "").trim();
  const newEdition = (data.edition ?? "").trim();
  const rawType = (data.type ?? "").toString().toLowerCase().trim();
  const type = rawType.indexOf("подп") !== -1 ? "подписки" : "игры";

  const { data: row } = await db
    .from("catalog_items")
    .select("id, editions")
    .eq("type", type)
    .eq("name", name)
    .maybeSingle();

  if (!row) return json({ error: "Игра не найдена" });

  const editions = (row.editions ?? []).filter(
    (e: string) => e && e.trim() !== "",
  );
  if (editions.length >= 5) {
    return json({ error: "Нет свободных слотов для изданий (макс. 5)" });
  }

  editions.push(newEdition);
  const { error } = await db
    .from("catalog_items")
    .update({ editions })
    .eq("id", row.id);

  if (error) return json({ error: error.message });

  await logActivity("game", "edition_add", "Добавлено издание", {
    details: gameLabel(name, newEdition),
    gameName: name,
    actor: data.actor,
    refId: row.id,
    undo: { edition: newEdition },
  });
  return json({ success: true });
}

async function handleAddAccount(data: any) {
  const finalDate = resolveDate(data.manualDate);
  const kind = (await isSubscriptionName(data.gameName)) ? "подписки" : "игры";

  const rate = await getRate(data.currency);
  const fiat = parseFloat(String(data.expense).replace(",", ".")) || 0;

  const { data: inserted, error } = await db
    .from("accounts")
    .insert({
      kind,
      game_name: data.gameName,
      edition: data.edition ?? "",
      login: data.login,
      purchase_date: finalDate,
      expense_fiat: fiat,
      currency: data.currency ?? "",
      rate,
    })
    .select("id")
    .single();

  if (error) return json({ error: error.message });

  const clearedEmpty = await clearEmptyAccount(data.login);

  const total = fiat * rate;
  await logActivity("account", "account_add", "Добавлен аккаунт", {
    details: accountDetails(data.gameName, data.edition, total),
    login: data.login,
    gameName: data.gameName,
    actor: data.actor || data.employee,
    refId: inserted.id,
    undo: { clearedEmpty },
    createdAt: finalDate,
  });

  let msg = "🆕 <b>Новый аккаунт</b>\n\n";
  msg += "🎮 <b>Игра:</b> " + data.gameName + " (" + data.edition + ")\n";
  msg += "✉️ <b>Логин:</b> " + data.login + "\n";
  msg += "💰 <b>Цена:</b> " + total.toFixed(2) + " ₽\n";
  msg += "👾 <b>Сотрудник:</b> " + data.employee + "\n";
  await sendTG(msg);

  return json({ success: true });
}

async function handleAddOrder(data: any) {
  const finalDate = resolveDate(data.manualDate);

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      login: data.login,
      game_name: data.gameName,
      edition: data.edition,
      client: data.client,
      slot: data.slot,
      price: parsePrice(data.price),
      payment_method: data.paymentMethod ?? "",
      avito_chat_id: str(data.avitoChatId) || null,
      employee: data.employee ?? "",
      created_at: finalDate,
    })
    .select("id")
    .single();

  if (orderError) {
    await sendTG(
      "🚨 <b>КРИТИЧЕСКАЯ ОШИБКА:</b>\nНе удалось добавить заказ в таблицу!\n\n<i>Текст ошибки:</i> " +
        orderError.message,
    );
    return json({ error: "Ошибка записи заказа" });
  }

  let hasErrors = false;
  let slotErrorMsg = "";
  let cleanError = false;
  const track: { slot?: any; createdAccountId?: string } = {};
  let clearedEmpty: any[] = [];

  try {
    await allocateSlot(
      data.login,
      data.gameName,
      data.edition,
      data.slot,
      data.expense,
      data.currency,
      finalDate,
      track,
      str(data.slotField),
    );
  } catch (err) {
    hasErrors = true;
    slotErrorMsg = (err as Error).message;
  }
  // Запоминаем, какой именно слот занял/освободил заказ (два П3 иначе не различить)
  if (track.slot?.field) {
    await db.from("orders").update({ slot_field: track.slot.field }).eq("id", order.id);
  }

  try {
    clearedEmpty = await clearEmptyAccount(data.login);
  } catch (_err) {
    hasErrors = true;
    cleanError = true;
  }

  const isReturn = String(data.slot).toLowerCase().indexOf("возврат") !== -1;
  await logActivity(
    "order",
    isReturn ? "order_return" : "order_add",
    isReturn ? "Возврат" : "Новый заказ",
    {
      details: orderDetails(data.gameName, data.edition, data.slot, data.client),
      login: data.login,
      gameName: data.gameName,
      actor: data.actor || data.employee,
      price: parsePrice(data.price),
      refId: order.id,
      undo: {
        slot: track.slot ?? null,
        createdAccountId: track.createdAccountId ?? null,
        clearedEmpty,
      },
      createdAt: finalDate,
    },
  );

  let msg = "🛒 <b>" + (isReturn ? "ОФОРМЛЕН ВОЗВРАТ" : "НОВЫЙ ЗАКАЗ") + "</b>\n\n";
  msg += "👤 <b>Клиент:</b> " + data.client + "\n";
  msg += "🎮 <b>Игра:</b> " + data.gameName + " (" + data.edition + ")\n";
  msg += "✉️ <b>Логин:</b> " + data.login + "\n";
  msg += "🕹 <b>Слот:</b> " + data.slot + "\n";
  msg += "💰 <b>" + (isReturn ? "Сумма:" : "Цена:") + "</b> " + data.price + " ₽\n";
  msg += "👾 <b>Сотрудник:</b> " + data.employee + "\n\n";
  if (hasErrors) {
    msg += "⚠️ <b>ОШИБКИ ПРИ ОБРАБОТКЕ:</b>\n";
    if (slotErrorMsg) msg += "❗️ <b>СЛОТЫ:</b> " + slotErrorMsg + "\n";
    if (cleanError) msg += "❗️ <b>БАЗА ПУСТЫХ:</b> Ошибка очистки.\n";
  }
  await sendTG(msg);

  return json({ success: true });
}

async function handleGetSlotHistory(data: any) {
  const target = (data.login ?? "").toString().trim().toLowerCase();
  const { data: rows } = await db
    .from("orders")
    .select("id, client, slot, slot_field, avito_chat_id, created_at, price, event")
    .ilike("login", target)
    .order("created_at", { ascending: true });

  const history = (rows ?? []).map((r: any) => ({
    id: r.id,
    slotField: r.slot_field ?? null,
    avitoChatId: r.avito_chat_id ?? null,
    client: r.client ?? "",
    slot: r.slot ?? "",
    date: fmtDate(r.created_at),
    price: r.price,
    event: r.event ?? "",
  }));

  return json({ success: true, history });
}

const ACTIVITY_PAGE_SIZE = 50;

// Пишет событие в журнал. Ошибка журнала не должна ломать само действие.
// action — код действия (order_add, game_add, ...), по нему журнал умеет
// править и отменять запись; refId — строка-источник, undo — состояние «до».
async function logActivity(
  type: string,
  action: string,
  title: string,
  fields: {
    details?: string;
    login?: string;
    gameName?: string;
    actor?: string;
    price?: number | null;
    refId?: string | null;
    undo?: unknown;
    createdAt?: string;
  } = {},
) {
  try {
    await db.from("activity_log").insert({
      type,
      action,
      title,
      details: fields.details ?? "",
      login: (fields.login ?? "").toString().trim(),
      game_name: fields.gameName ?? "",
      actor: (fields.actor ?? "").toString().trim(),
      price: fields.price ?? null,
      ref_id: fields.refId ?? null,
      undo: fields.undo ?? null,
      ...(fields.createdAt ? { created_at: fields.createdAt } : {}),
    });
  } catch (_e) {
    return;
  }
}

function gameLabel(gameName: string, edition?: string) {
  return edition ? `${gameName} (${edition})` : gameName;
}

function orderDetails(gameName: string, edition: string, slot: string, client: string) {
  return [gameLabel(gameName, edition), slot, client].filter(Boolean).join(" · ");
}

function accountDetails(gameName: string, edition: string, expense: number) {
  return gameLabel(gameName, edition) +
    (expense ? ` · расход ${Math.round(expense)} ₽` : "");
}

function expenseDetails(gameName: string, edition: string, value: number) {
  return [gameName && gameLabel(gameName, edition), `${value} ₽`]
    .filter(Boolean)
    .join(" · ");
}

function parsePrice(value: unknown): number | null {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(String(value).replace(",", "."));
  return isNaN(n) ? null : n;
}

async function handleGetActivity(data: any) {
  const offset = Math.max(0, Number(data.offset) || 0);

  let q = db
    .from("activity_log")
    .select(
      "id, type, action, title, details, login, game_name, actor, price, created_at, sort_at, edited_at, restored_at",
    );

  const search = (data.search ?? "")
    .toString()
    .trim()
    .replace(/[,()%*\\]/g, " ")
    .trim();
  if (search) {
    const p = `%${search}%`;
    q = q.or(
      `title.ilike.${p},details.ilike.${p},login.ilike.${p},game_name.ilike.${p},actor.ilike.${p}`,
    );
  }
  // Ручные действия со слотами в журнале не показываем (есть в истории слота)
  q = q.neq("type", "slot");
  if (data.type && data.type !== "all") q = q.eq("type", data.type);

  const { data: rows, error } = await q
    .order("sort_at", { ascending: false })
    .range(offset, offset + ACTIVITY_PAGE_SIZE - 1);

  if (error) return json({ success: false, error: error.message });

  const events = (rows ?? []).map((r: any) => ({
    id: r.id,
    type: r.type,
    action: r.action ?? "",
    title: r.title,
    details: r.details ?? "",
    login: r.login ?? "",
    gameName: r.game_name ?? "",
    actor: r.actor ?? "",
    price: r.price,
    createdAt: r.created_at,
    sortAt: r.sort_at,
    editedAt: r.edited_at,
    restoredAt: r.restored_at,
  }));

  return json({
    success: true,
    events,
    hasMore: events.length === ACTIVITY_PAGE_SIZE,
  });
}

async function loadActivity(id: unknown) {
  if (!id) return null;
  const { data } = await db
    .from("activity_log")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function fetchRef(table: string, id: unknown) {
  if (!id) return null;
  const { data } = await db.from(table).select("*").eq("id", id).maybeSingle();
  return data;
}

function str(value: unknown) {
  return (value ?? "").toString().trim();
}

// Почта для ilike без учёта регистра, но буквально: "_" и "%" в ilike — шаблоны
// ("_" — любой символ), а в почтах подчёркивание встречается часто
function exactLogin(value: string) {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

// Текущие значения полей записи журнала. null — исходных данных больше нет
// (или действие не откатывается): можно только убрать строку из журнала.
async function activityFields(ev: any): Promise<Record<string, unknown> | null> {
  switch (ev.action) {
    case "order_add":
    case "order_return": {
      const o = await fetchRef("orders", ev.ref_id);
      if (!o) return null;
      return {
        client: o.client ?? "",
        price: o.price,
        paymentMethod: o.payment_method ?? "",
        employee: o.employee ?? "",
        date: o.created_at,
      };
    }
    case "account_add": {
      const a = await fetchRef("accounts", ev.ref_id);
      if (!a) return null;
      return { login: a.login ?? "", expense: Number(a.expense_total ?? 0) };
    }
    case "account_expense": {
      const a = await fetchRef("accounts", ev.undo?.prev?.[0]?.id);
      if (!a) return null;
      return { expense: Number(a.expense_total ?? 0) };
    }
    case "game_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      return g ? { name: g.name } : null;
    }
    case "edition_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const edition = ev.undo?.edition;
      if (!g || !edition || !(g.editions ?? []).includes(edition)) return null;
      return { edition };
    }
    case "game_update":
    case "prices_update":
      return ev.undo?.before && (await fetchRef("catalog_items", ev.ref_id))
        ? {}
        : null;
    case "standard_prices_update":
      return ev.undo?.before && (await fetchRef("standard_prices", ev.ref_id))
        ? {}
        : null;
    case "empty_add":
    case "empty_update": {
      const e = await fetchRef("empty_accounts", ev.ref_id);
      return e ? { email: e.email, region: e.region } : null;
    }
    case "empty_trash":
    case "empty_restore":
      return (await fetchRef("empty_accounts", ev.ref_id)) ? {} : null;
    case "deleted":
      return {};
    default:
      return null;
  }
}

type InfoRow = { label: string; value: unknown; kind?: "date" | "price" | "mono" };

// Полная информация о записи для экрана просмотра: строки «название — значение»
async function activityInfo(ev: any): Promise<InfoRow[]> {
  const rows: InfoRow[] = [];
  const add = (label: string, value: unknown, kind?: InfoRow["kind"]) => {
    if (value !== null && value !== undefined && value !== "") rows.push({ label, value, kind });
  };

  switch (ev.action) {
    case "order_add":
    case "order_return": {
      const o = await fetchRef("orders", ev.ref_id);
      if (!o) break;
      add("Дата", o.created_at, "date");
      add("Сотрудник", o.employee);
      add("Клиент", o.client);
      add("Игра", gameLabel(o.game_name, o.edition));
      add("Слот", o.slot);
      add("Логин", o.login, "mono");
      add("Цена", o.price, "price");
      add("Способ оплаты", o.payment_method);
      return rows;
    }
    case "account_add":
    case "account_expense": {
      const id = ev.action === "account_add" ? ev.ref_id : ev.undo?.prev?.[0]?.id;
      const a = await fetchRef("accounts", id);
      if (!a) break;
      add("Дата", ev.action === "account_add" ? a.purchase_date ?? a.created_at : ev.created_at, "date");
      add("Игра", gameLabel(a.game_name, a.edition));
      add("Логин", a.login, "mono");
      add("Расход", Number(a.expense_total ?? 0), "price");
      return rows;
    }
    case "game_add":
    case "edition_add":
    case "game_update":
    case "prices_update": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      if (!g) break;
      add("Дата", ev.created_at, "date");
      add(g.type === "подписки" ? "Подписка" : "Игра", g.name);
      if (ev.action === "edition_add") add("Издание", ev.undo?.edition);
      if (ev.action === "game_update") add("Изменения", String(ev.details).split(" · ").slice(1).join(" · "));
      add("Издания", (g.editions ?? []).join(", "));
      add("Платформы", [g.has_ps5 && "PS5", g.has_ps4 && "PS4"].filter(Boolean).join(", "));
      return rows;
    }
    case "empty_add":
    case "empty_update":
    case "empty_trash":
    case "empty_restore": {
      const e = await fetchRef("empty_accounts", ev.ref_id);
      if (!e) break;
      add("Дата", ev.created_at, "date");
      add("Почта", e.email, "mono");
      add("Регион", e.region);
      add("Статус", e.is_problem ? "В корзине" : e.status);
      return rows;
    }
  }

  // Удалённые записи и записи без исходных данных — то, что сохранилось в журнале
  add(ev.action === "deleted" ? "Удалено" : "Дата", ev.created_at, "date");
  add("Описание", ev.details);
  add(ev.type === "empty" ? "Почта" : "Логин", ev.login, "mono");
  add("Цена", ev.price, "price");
  return rows;
}

async function handleGetActivityItem(data: any) {
  const ev = await loadActivity(data.id);
  if (!ev) return json({ success: false, error: "Запись не найдена" });
  const fields = await activityFields(ev);
  const info = await activityInfo(ev);
  return json({ success: true, fields: fields ?? {}, linked: fields !== null, info });
}

async function handleUpdateActivity(data: any) {
  const ev = await loadActivity(data.id);
  if (!ev) return json({ success: false, error: "Запись не найдена" });
  if (!(await activityFields(ev))) {
    return json({ success: false, error: "Исходные данные уже удалены — изменить нельзя" });
  }
  const f = data.fields ?? {};

  switch (ev.action) {
    case "order_add":
    case "order_return": {
      const o = await fetchRef("orders", ev.ref_id);
      let price = f.price !== undefined ? parsePrice(f.price) : o.price;
      if (ev.action === "order_return" && price !== null && price > 0) price = -price;
      const date = f.date ? new Date(f.date) : null;
      const createdAt = date && !isNaN(date.getTime()) ? date.toISOString() : o.created_at;
      const patch = {
        client: f.client !== undefined ? str(f.client) : o.client,
        price,
        payment_method: f.paymentMethod !== undefined ? str(f.paymentMethod) : o.payment_method,
        employee: f.employee !== undefined ? str(f.employee) : o.employee,
        created_at: createdAt,
      };
      const { error } = await db.from("orders").update(patch).eq("id", o.id);
      if (error) return json({ success: false, error: error.message });
      await db
        .from("activity_log")
        .update({
          details: orderDetails(o.game_name, o.edition, o.slot, patch.client),
          price: patch.price,
          actor: patch.employee || ev.actor,
          created_at: createdAt,
        })
        .eq("id", ev.id);
      break;
    }
    case "account_add": {
      const a = await fetchRef("accounts", ev.ref_id);
      const newLogin = str(f.login) || a.login;
      const patch: Record<string, unknown> = { login: newLogin };
      let expense = Number(a.expense_total ?? 0);
      if (f.expense !== undefined) {
        const value = parseFloat(String(f.expense).replace(",", ".")) || 0;
        if (value !== expense) {
          Object.assign(patch, { expense_fiat: value, rate: 1, currency: "RUB" });
          expense = value;
        }
      }
      const { error } = await db.from("accounts").update(patch).eq("id", a.id);
      if (error) return json({ success: false, error: error.message });
      if (newLogin !== a.login) {
        await db
          .from("orders")
          .update({ login: newLogin })
          .ilike("login", a.login)
          .eq("game_name", a.game_name);
        await db
          .from("activity_log")
          .update({ login: newLogin })
          .ilike("login", a.login)
          .eq("game_name", a.game_name);
      }
      await db
        .from("activity_log")
        .update({
          login: newLogin,
          details: accountDetails(a.game_name, a.edition, expense),
        })
        .eq("id", ev.id);
      break;
    }
    case "account_expense": {
      const value = parseFloat(String(f.expense ?? "").replace(",", ".")) || 0;
      const ids = (ev.undo?.prev ?? []).map((p: any) => p.id);
      const { error } = await db
        .from("accounts")
        .update({ expense_fiat: value, rate: 1, currency: "RUB" })
        .in("id", ids);
      if (error) return json({ success: false, error: error.message });
      await db
        .from("activity_log")
        .update({ details: String(ev.details).replace(/-?[\d.,]+ ₽$/, `${value} ₽`) })
        .eq("id", ev.id);
      break;
    }
    case "game_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const newName = str(f.name);
      if (!newName) return json({ success: false, error: "Введите название" });
      if (newName !== g.name) {
        const { data: taken } = await db
          .from("catalog_items")
          .select("id")
          .eq("type", g.type)
          .eq("name", newName)
          .maybeSingle();
        if (taken) return json({ success: false, error: "Игра с таким названием уже есть" });
        const { error } = await db
          .from("catalog_items")
          .update({ name: newName })
          .eq("id", g.id);
        if (error) return json({ success: false, error: error.message });
        await renameGame(g.name, newName, g.type);
      }
      await db
        .from("activity_log")
        .update({ details: newName, game_name: newName })
        .eq("id", ev.id);
      break;
    }
    case "edition_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const oldEdition = ev.undo.edition;
      const newEdition = str(f.edition);
      if (!newEdition) return json({ success: false, error: "Введите издание" });
      if (newEdition !== oldEdition) {
        if ((g.editions ?? []).includes(newEdition)) {
          return json({ success: false, error: "Такое издание уже есть" });
        }
        const editions = (g.editions ?? []).map((e: string) =>
          e === oldEdition ? newEdition : e
        );
        const { error } = await db
          .from("catalog_items")
          .update({ editions, prices: renamePriceEdition(g.prices, oldEdition, newEdition) })
          .eq("id", g.id);
        if (error) return json({ success: false, error: error.message });
        await db
          .from("accounts")
          .update({ edition: newEdition })
          .eq("game_name", g.name)
          .eq("kind", g.type)
          .eq("edition", oldEdition);
        await db
          .from("orders")
          .update({ edition: newEdition })
          .eq("game_name", g.name)
          .eq("edition", oldEdition);
      }
      await db
        .from("activity_log")
        .update({
          details: gameLabel(g.name, newEdition),
          undo: { edition: newEdition },
        })
        .eq("id", ev.id);
      break;
    }
    case "empty_add":
    case "empty_update": {
      const email = str(f.email);
      const region = str(f.region).toUpperCase();
      if (!email || !region) return json({ success: false, error: "Заполните почту и регион" });
      const { error } = await db
        .from("empty_accounts")
        .update({ email, region })
        .eq("id", ev.ref_id);
      if (error) return json({ success: false, error: error.message });
      await db
        .from("activity_log")
        .update({ login: email, details: region })
        .eq("id", ev.id);
      break;
    }
    default:
      return json({ success: false, error: "В этой записи нечего менять" });
  }

  // Изменённая запись — последнее действие: поднимаем её наверх журнала
  const now = new Date().toISOString();
  await db
    .from("activity_log")
    .update({ sort_at: now, edited_at: now })
    .eq("id", ev.id);

  return json({ success: true });
}

// Журнал отката: что поменяли при удалении записи, чтобы потом восстановить.
// insert — вернуть удалённую строку целиком, update — вернуть прежние значения
// полей, delete — убрать строку, созданную при откате, rename — имя игры.
type JournalStep = {
  table: string;
  op: "insert" | "update" | "delete" | "rename";
  row: any;
};

const GENERATED_COLUMNS: Record<string, string[]> = { accounts: ["expense_total"] };
const SLOT_FIELDS = ["slot1", "slot2", "slot3", "slot4", "slot5"];

function storable(table: string, row: any) {
  const copy = { ...row };
  for (const col of GENERATED_COLUMNS[table] ?? []) delete copy[col];
  return copy;
}

function pick(row: any, keys: string[]) {
  const out: Record<string, unknown> = { id: row.id };
  for (const k of keys) out[k] = row[k];
  return out;
}

async function deleteRows(journal: JournalStep[], table: string, rows: any[]) {
  for (const row of rows) {
    journal.push({ table, op: "insert", row: storable(table, row) });
    await db.from(table).delete().eq("id", row.id);
  }
}

async function updateRow(
  journal: JournalStep[],
  table: string,
  row: any,
  patch: Record<string, unknown>,
) {
  journal.push({ table, op: "update", row: pick(row, Object.keys(patch)) });
  await db.from(table).update(patch).eq("id", row.id);
}

// Возвращает слот в состояние до действия, если его с тех пор не трогали
async function revertSlot(journal: JournalStep[], slot: any, warnings: string[]) {
  const acc = await fetchRef("accounts", slot?.accountId);
  if (!acc) return;
  if (toBool(acc[slot.field]) !== slot.value) {
    warnings.push("Слот уже изменён позже — оставлен как есть");
    return;
  }
  await updateRow(journal, "accounts", acc, { [slot.field]: !slot.value });
}

// Для старых записей без сохранённого слота: применяем обратное действие
async function invertSlotByName(
  journal: JournalStep[],
  acc: any,
  slotName: string,
  undoOccupy: boolean,
  warnings: string[],
) {
  if (!acc) return;
  const base = slotName.replace(/возврат\s*/i, "").trim();
  try {
    await applySlot(acc, undoOccupy ? "Возврат " + base : base);
  } catch (_e) {
    warnings.push("Слот " + base + " уже в нужном состоянии — не изменён");
    return;
  }
  const after = await fetchRef("accounts", acc.id);
  const changed = SLOT_FIELDS.filter((f) => toBool(acc[f]) !== toBool(after?.[f]));
  if (changed.length) {
    journal.push({ table: "accounts", op: "update", row: pick(acc, changed) });
  }
}

async function restoreEmpty(journal: JournalStep[], rows: any[] | undefined) {
  for (const row of rows ?? []) {
    const { data: existing } = await db
      .from("empty_accounts")
      .select("id")
      .ilike("email", row.email)
      .maybeSingle();
    if (existing) continue;
    const { data: inserted } = await db
      .from("empty_accounts")
      .insert(row)
      .select("id")
      .single();
    if (inserted) journal.push({ table: "empty_accounts", op: "delete", row: inserted });
  }
}

async function countOrders(login: string, gameName: string) {
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .ilike("login", login)
    .eq("game_name", gameName)
    .eq("event", "");
  return count ?? 0;
}

// Откатывает действие записи журнала, записывая каждое изменение в journal.
// Все проверки идут до первого изменения. Возвращает текст ошибки или null.
async function undoActivity(
  ev: any,
  warnings: string[],
  journal: JournalStep[],
): Promise<string | null> {
  switch (ev.action) {
    case "order_add":
    case "order_return": {
      const o = await fetchRef("orders", ev.ref_id);
      if (ev.undo) {
        if (ev.undo.slot) await revertSlot(journal, ev.undo.slot, warnings);
      } else {
        await invertSlotByName(
          journal,
          await findAccountByLogin(o.login),
          o.slot,
          ev.action !== "order_return",
          warnings,
        );
      }
      await deleteRows(journal, "orders", [o]);

      const created = await fetchRef("accounts", ev.undo?.createdAccountId);
      if (created) {
        if ((await countOrders(created.login, created.game_name)) === 0) {
          await deleteRows(journal, "accounts", [created]);
        } else {
          warnings.push("Аккаунт, созданный этим заказом, оставлен: на нём есть другие заказы");
        }
      }
      await restoreEmpty(journal, ev.undo?.clearedEmpty);
      return null;
    }
    case "account_add": {
      const a = await fetchRef("accounts", ev.ref_id);
      const orders = await countOrders(a.login, a.game_name);
      if (orders > 0) {
        return `На аккаунте есть заказы (${orders}). Сначала удалите их в истории.`;
      }
      const { data: manual } = await db
        .from("orders")
        .select("*")
        .ilike("login", a.login)
        .eq("game_name", a.game_name);
      await deleteRows(journal, "orders", manual ?? []);
      await deleteRows(journal, "accounts", [a]);
      await restoreEmpty(journal, ev.undo?.clearedEmpty);
      return null;
    }
    case "account_expense": {
      for (const p of ev.undo?.prev ?? []) {
        const acc = await fetchRef("accounts", p.id);
        if (!acc) continue;
        await updateRow(journal, "accounts", acc, {
          expense_fiat: p.expense_fiat,
          rate: p.rate,
          currency: p.currency,
        });
      }
      return null;
    }
    case "game_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const { count } = await db
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("game_name", g.name)
        .eq("kind", g.type);
      if (count) return `У игры есть аккаунты (${count}). Сначала удалите их в истории.`;
      const { data: related } = await db
        .from("activity_log")
        .select("*")
        .eq("type", "game")
        .eq("game_name", g.name)
        .neq("action", "deleted")
        .neq("id", ev.id);
      await deleteRows(journal, "activity_log", related ?? []);
      await deleteRows(journal, "catalog_items", [g]);
      return null;
    }
    case "edition_add": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const edition = ev.undo.edition;
      const { count } = await db
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("game_name", g.name)
        .eq("kind", g.type)
        .eq("edition", edition);
      if (count) return `У издания есть аккаунты (${count}). Сначала удалите их в истории.`;
      const editions = (g.editions ?? []).filter((e: string) => e !== edition);
      if (editions.length === 0) return "Нельзя удалить единственное издание игры";
      await updateRow(journal, "catalog_items", g, { editions });
      return null;
    }
    case "game_update": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      const before = ev.undo.before;
      await updateRow(journal, "catalog_items", g, {
        name: before.name,
        editions: before.editions,
        cover_url: before.cover_url,
        has_ps5: before.has_ps5,
        has_ps4: before.has_ps4,
      });
      if (g.name !== before.name) {
        await renameGame(g.name, before.name, g.type);
        journal.push({
          table: "catalog_items",
          op: "rename",
          row: { type: g.type, from: g.name, to: before.name },
        });
      }
      return null;
    }
    case "prices_update": {
      const g = await fetchRef("catalog_items", ev.ref_id);
      await updateRow(journal, "catalog_items", g, { prices: ev.undo.before });
      return null;
    }
    case "standard_prices_update": {
      const row = await fetchRef("standard_prices", ev.ref_id);
      await updateRow(journal, "standard_prices", row, { prices: ev.undo.before });
      return null;
    }
    case "empty_add": {
      const e = await fetchRef("empty_accounts", ev.ref_id);
      await deleteRows(journal, "empty_accounts", [e]);
      return null;
    }
    case "empty_update": {
      const e = await fetchRef("empty_accounts", ev.ref_id);
      if (ev.undo?.prev) await updateRow(journal, "empty_accounts", e, ev.undo.prev);
      return null;
    }
    case "empty_trash":
    case "empty_restore": {
      const e = await fetchRef("empty_accounts", ev.ref_id);
      await updateRow(journal, "empty_accounts", e, {
        is_problem: ev.action === "empty_restore",
      });
      return null;
    }
    default:
      return null;
  }
}

const DELETED_TITLES: Record<string, string> = {
  order_add: "Удалён заказ",
  order_return: "Удалён возврат",
  account_add: "Удалён аккаунт",
  account_expense: "Отменено изменение расхода",
  edition_add: "Удалено издание",
  game_update: "Отменено изменение игры",
  prices_update: "Отменено изменение цен",
  standard_prices_update: "Отменено изменение цен подписок",
  empty_add: "Удалён пустой аккаунт",
  empty_update: "Отменено обновление пустого аккаунта",
  empty_trash: "Отменён перенос в корзину",
  empty_restore: "Отменено восстановление из корзины",
};

function deletedTitle(ev: any, linked: boolean) {
  if (!linked) return `Удалена запись: ${ev.title}`;
  if (ev.action === "game_add") {
    return ev.title === "Добавлена подписка" ? "Удалена подписка" : "Удалена игра";
  }
  return DELETED_TITLES[ev.action] ?? `Удалена запись: ${ev.title}`;
}

async function handleDeleteActivity(data: any) {
  const ev = await loadActivity(data.id);
  if (!ev) return json({ success: false, error: "Запись не найдена" });

  // Запись об удалении убираем насовсем — восстановить её уже будет нельзя
  if (ev.action === "deleted") {
    await db.from("activity_log").delete().eq("id", ev.id);
    return json({ success: true, warnings: [] });
  }

  const warnings: string[] = [];
  const journal: JournalStep[] = [];
  // Если исходных данных уже нет — откатывать нечего, убираем только запись
  const linked = (await activityFields(ev)) !== null;
  if (linked) {
    const error = await undoActivity(ev, warnings, journal);
    if (error) return json({ success: false, error });
  }

  await deleteRows(journal, "activity_log", [ev]);
  await logActivity(ev.type, "deleted", deletedTitle(ev, linked), {
    details: ev.details,
    login: ev.login,
    gameName: ev.game_name,
    actor: data.actor,
    undo: { journal },
  });

  return json({ success: true, warnings });
}

// Возвращает всё, что убрало удаление, и саму исходную запись журнала
async function handleRestoreActivity(data: any) {
  const ev = await loadActivity(data.id);
  if (!ev || ev.action !== "deleted") {
    return json({ success: false, error: "Эту запись нельзя восстановить" });
  }

  const steps: JournalStep[] = ev.undo?.journal ?? [];
  for (const step of [...steps].reverse()) {
    let error: any = null;
    if (step.op === "rename") {
      await renameGame(step.row.to, step.row.from, step.row.type);
    } else if (step.op === "delete") {
      ({ error } = await db.from(step.table).delete().eq("id", step.row.id));
    } else if (step.op === "update") {
      const { id, ...fields } = step.row;
      ({ error } = await db.from(step.table).update(fields).eq("id", id));
    } else {
      ({ error } = await db.from(step.table).upsert(step.row));
    }
    if (error) {
      return json({ success: false, error: "Не удалось восстановить: " + error.message });
    }
  }

  // Восстановленная запись — последнее действие: поднимаем её наверх журнала.
  // Исходная запись журнала всегда удаляется последней, значит, она последняя в steps.
  const original = [...steps]
    .reverse()
    .find((s) => s.table === "activity_log" && s.op === "insert");
  if (original) {
    const now = new Date().toISOString();
    await db
      .from("activity_log")
      .update({ sort_at: now, restored_at: now })
      .eq("id", original.row.id);
  }

  await db.from("activity_log").delete().eq("id", ev.id);
  return json({ success: true });
}

async function handleUpdateGame(data: any) {
  const id = data.id;
  if (!id) return json({ success: false, error: "Нет id" });

  const { data: existing } = await db
    .from("catalog_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return json({ success: false, error: "Игра не найдена" });

  const oldName = existing.name;
  const type = existing.type;

  const newName = (data.name ?? oldName).toString().trim() || oldName;
  const editions = (data.editions ?? existing.editions ?? []).filter(
    (e: string) => e && e.trim() !== "",
  );

  if (editions.length === 0) {
    return json({ success: false, error: "Нужно хотя бы одно издание" });
  }

  const coverUrl = data.coverUrl !== undefined
    ? (data.coverUrl ?? "").toString().trim()
    : existing.cover_url;
  const hasPS5 = data.hasPS5 !== undefined ? data.hasPS5 : existing.has_ps5;
  const hasPS4 = data.hasPS4 !== undefined ? data.hasPS4 : existing.has_ps4;

  const { error } = await db
    .from("catalog_items")
    .update({
      name: newName,
      cover_url: coverUrl,
      editions,
      has_ps5: hasPS5,
      has_ps4: hasPS4,
    })
    .eq("id", id);

  if (error) return json({ success: false, error: error.message });

  await renameGame(oldName, newName, type);

  const changes: string[] = [];
  if (newName !== oldName) changes.push(`название: ${oldName} → ${newName}`);
  if (editions.join("|") !== (existing.editions ?? []).join("|")) {
    changes.push(`издания: ${editions.join(", ")}`);
  }
  if (coverUrl !== existing.cover_url) changes.push("обложка");
  if (hasPS5 !== existing.has_ps5 || hasPS4 !== existing.has_ps4) {
    changes.push(
      "платформы: " + [hasPS5 && "PS5", hasPS4 && "PS4"].filter(Boolean).join(", "),
    );
  }
  if (changes.length > 0) {
    await logActivity("game", "game_update", "Изменена игра", {
      details: `${newName} · ${changes.join("; ")}`,
      gameName: newName,
      actor: data.actor,
      refId: id,
      undo: {
        before: {
          name: oldName,
          editions: existing.editions ?? [],
          cover_url: existing.cover_url,
          has_ps5: existing.has_ps5,
          has_ps4: existing.has_ps4,
        },
      },
    });
  }

  return json({ success: true });
}

// Переименование игры тянет за собой аккаунты, заказы и журнал
async function renameGame(oldName: string, newName: string, type: string) {
  if (oldName === newName) return;
  await db
    .from("accounts")
    .update({ game_name: newName })
    .eq("game_name", oldName)
    .eq("kind", type);
  await db
    .from("orders")
    .update({ game_name: newName })
    .eq("game_name", oldName);
  await db
    .from("activity_log")
    .update({ game_name: newName })
    .eq("game_name", oldName);
}

async function handleGetAccountInfo(data: any) {
  const target = (data.login ?? "").toString().trim().toLowerCase();
  if (!target) return json({ success: false });

  const [accRes, orderRes] = await Promise.all([
    db
      .from("accounts")
      .select("expense_total, purchase_date, created_at")
      .ilike("login", target),
    db
      .from("orders")
      .select("price, created_at")
      .ilike("login", target),
  ]);

  let spent = 0;
  let createdAt: string | null = null;
  for (const r of accRes.data ?? []) {
    spent += Number(r.expense_total ?? 0);
    const d = (r.purchase_date ?? r.created_at) as string | null;
    if (d && (!createdAt || new Date(d) < new Date(createdAt))) {
      createdAt = d;
    }
  }

  let received = 0;
  for (const o of orderRes.data ?? []) {
    received += Number(o.price ?? 0);
  }

  return json({
    success: true,
    spent,
    received,
    profit: received - spent,
    createdAt: createdAt ? fmtDate(createdAt) : "",
  });
}

async function handleUpdateAccountExpense(data: any) {
  const login = (data.login ?? "").toString().trim();
  if (!login) return json({ success: false, error: "Нет логина" });

  const value = parseFloat(String(data.expense ?? "").replace(",", ".")) || 0;

  let q = db
    .from("accounts")
    .select("id, expense_fiat, rate, currency")
    .ilike("login", login.toLowerCase());

  if (data.gameName) q = q.eq("game_name", data.gameName);
  if (data.edition !== undefined && data.edition !== null) {
    q = q.eq("edition", data.edition);
  }

  const { data: prev, error: selectError } = await q;
  if (selectError) return json({ success: false, error: selectError.message });

  const ids = (prev ?? []).map((r: any) => r.id);
  const { error } = await db
    .from("accounts")
    .update({ expense_fiat: value, rate: 1, currency: "RUB" })
    .in("id", ids);
  if (error) return json({ success: false, error: error.message });

  await logActivity("account", "account_expense", "Изменён расход аккаунта", {
    details: expenseDetails(data.gameName, data.edition, value),
    login,
    gameName: data.gameName ?? "",
    actor: data.actor,
    refId: ids[0] ?? null,
    undo: { prev: prev ?? [] },
  });

  return json({ success: true });
}

// Удаление игры/подписки из настроек — по тем же правилам, что откат «Добавлена игра» в журнале:
// нельзя, пока у игры есть аккаунты; всё удалённое уходит в журнал и восстанавливается оттуда.
async function handleDeleteGame(data: any) {
  const { data: game, error } = await db.from("catalog_items").select("*").eq("id", str(data.id)).maybeSingle();
  if (error) throw error;
  if (!game) return json({ success: false, error: "Игра не найдена" });

  const { count } = await db
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("game_name", game.name)
    .eq("kind", game.type);
  if (count) return json({ success: false, error: `У игры есть аккаунты (${count}). Сначала удалите их.` });

  const journal: JournalStep[] = [];
  // Записи журнала об этой игре (добавление, издания, цены) — иначе их откат ссылался бы на удалённую игру
  const { data: related } = await db
    .from("activity_log")
    .select("*")
    .eq("type", "game")
    .eq("game_name", game.name)
    .neq("action", "deleted");
  await deleteRows(journal, "activity_log", related ?? []);
  await deleteRows(journal, "catalog_items", [game]);

  const isSub = String(game.type).toLowerCase().includes("подп");
  await logActivity("game", "deleted", isSub ? "Удалена подписка" : "Удалена игра", {
    details: game.name,
    gameName: game.name,
    actor: data.actor,
    undo: { journal },
  });
  return json({ success: true });
}

// Смена почты (логина) аккаунта. Заказы и журнал связаны с аккаунтом по почте,
// поэтому переписываем её и там (в пределах этой игры) — иначе история аккаунта потеряется.
async function handleUpdateAccountLogin(data: any) {
  const oldLogin = str(data.login);
  const newLogin = str(data.newLogin);
  if (!oldLogin || !newLogin) return json({ success: false, error: "Укажите почту" });
  if (newLogin === oldLogin) return json({ success: true, login: newLogin });

  const { data: rows, error } = await db
    .from("accounts")
    .select("id")
    .eq("game_name", data.gameName)
    .eq("edition", data.edition)
    .ilike("login", exactLogin(oldLogin));
  if (error) throw error;
  const account = rows?.[0];
  if (!account) return json({ success: false, error: "Аккаунт не найден" });

  // Регистр букв в почте поменять можно, а занять почту другого аккаунта — нет
  if (newLogin.toLowerCase() !== oldLogin.toLowerCase()) {
    const { data: taken, error: takenError } = await db
      .from("accounts")
      .select("id")
      .ilike("login", exactLogin(newLogin))
      .limit(1);
    if (takenError) throw takenError;
    if (taken && taken.length > 0) return json({ success: false, error: "Аккаунт с такой почтой уже есть" });
  }

  const { error: accountError } = await db.from("accounts").update({ login: newLogin }).eq("id", account.id);
  if (accountError) throw accountError;
  await db.from("orders").update({ login: newLogin }).ilike("login", exactLogin(oldLogin)).eq("game_name", data.gameName);
  await db.from("activity_log").update({ login: newLogin }).ilike("login", exactLogin(oldLogin)).eq("game_name", data.gameName);

  await logActivity("account", "account_login", "Изменена почта аккаунта", {
    details: `${oldLogin} → ${newLogin}`,
    login: newLogin,
    gameName: data.gameName ?? "",
    actor: data.actor,
    refId: account.id,
  });
  return json({ success: true, login: newLogin });
}

// Удаление аккаунта из окна «Аккаунт» — по тем же правилам, что откат «Добавлен аккаунт» в журнале:
// нельзя, пока на аккаунте есть заказы; всё удалённое уходит в журнал и восстанавливается оттуда.
async function handleDeleteAccount(data: any) {
  const { data: rows, error } = await db
    .from("accounts")
    .select("*")
    .eq("game_name", data.gameName)
    .eq("edition", data.edition)
    .ilike("login", exactLogin(str(data.login)));
  if (error) throw error;
  const account = rows?.[0];
  if (!account) return json({ success: false, error: "Аккаунт не найден" });

  const orders = await countOrders(account.login, account.game_name);
  if (orders > 0) {
    return json({
      success: false,
      error: `На аккаунте есть заказы (${orders}). Сначала удалите их в истории.`,
    });
  }

  const journal: JournalStep[] = [];
  // Ручные «занять/освободить слот» — это не заказы, удаляются вместе с аккаунтом
  const { data: manual } = await db
    .from("orders")
    .select("*")
    .ilike("login", exactLogin(account.login))
    .eq("game_name", account.game_name);
  await deleteRows(journal, "orders", manual ?? []);
  // Запись «Добавлен аккаунт» тоже убираем: её откат ссылался бы на удалённый аккаунт
  const { data: added } = await db
    .from("activity_log")
    .select("*")
    .eq("action", "account_add")
    .eq("ref_id", account.id);
  await deleteRows(journal, "activity_log", added ?? []);
  await deleteRows(journal, "accounts", [account]);

  await logActivity("account", "deleted", "Удалён аккаунт", {
    details: accountDetails(account.game_name, account.edition, Number(account.expense_total) || 0),
    login: account.login,
    gameName: account.game_name,
    actor: data.actor,
    undo: { journal },
  });
  return json({ success: true });
}

// Цена (сколько получено) заказа — меняется из окна истории слота
async function handleUpdateOrderPrice(data: any) {
  const id = str(data.orderId);
  const { data: order, error } = await db.from("orders").select("id, event").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!order || order.event) return json({ success: false, error: "Заказ не найден" });

  const price = parsePrice(data.price);
  const { error: updateError } = await db.from("orders").update({ price }).eq("id", id);
  if (updateError) throw updateError;
  // В журнале у записи заказа своя копия цены — обновляем, чтобы суммы совпадали
  await db.from("activity_log").update({ price }).eq("ref_id", id).in("action", ["order_add", "order_return"]);
  return json({ success: true, price });
}

// Сброс общего доступа — не чаще раза в 6 месяцев
function addMonthsIso(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Сброс общего доступа аккаунта: дата (YYYY-MM-DD) или пусто — убрать отметку
async function handleSetAccountReset(data: any) {
  const date = str(data.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ success: false, error: "Неверная дата" }, 400);

  const { data: rows, error } = await db
    .from("accounts")
    .select("id, shared_reset_at")
    .eq("game_name", data.gameName)
    .eq("edition", data.edition)
    .ilike("login", exactLogin(str(data.login)));
  if (error) throw error;
  const account = rows?.[0];
  if (!account) return json({ success: false, error: "Аккаунт не найден" }, 404);

  // Новый сброс — только через 6 месяцев после прошлого (отметку по ошибке сначала убирают)
  if (date && account.shared_reset_at) {
    const nextAllowed = addMonthsIso(account.shared_reset_at, 6);
    if (date < nextAllowed) {
      return json({ success: false, error: `Следующий сброс возможен с ${nextAllowed.split("-").reverse().join(".")}` });
    }
  }

  const { error: updateError } = await db
    .from("accounts")
    .update({ shared_reset_at: date || null })
    .eq("id", account.id);
  if (updateError) throw updateError;
  return json({ success: true, sharedResetAt: date || null });
}

// Заметка к слоту: пустой текст удаляет заметку
async function handleUpdateSlotNote(data: any) {
  const slotNumber = Number(data.slotIndex) + 1;
  if (!(slotNumber >= 1 && slotNumber <= 5)) return json({ success: false, error: "Неверный слот" }, 400);

  const { data: rows, error } = await db
    .from("accounts")
    .select("id, slot_notes")
    .eq("game_name", data.gameName)
    .eq("edition", data.edition)
    .ilike("login", exactLogin(str(data.email)));
  if (error) throw error;
  if (!rows || rows.length === 0) return json({ success: false, error: "Аккаунт не найден" }, 404);

  const notes = { ...(rows[0].slot_notes ?? {}) };
  const note = str(data.note);
  if (note) notes[String(slotNumber)] = note;
  else delete notes[String(slotNumber)];

  const { error: updateError } = await db.from("accounts").update({ slot_notes: notes }).eq("id", rows[0].id);
  if (updateError) throw updateError;
  return json({ success: true, note });
}

async function handleToggleSlot(data: any) {
  const field = `slot${Number(data.slotIndex) + 1}`;
  const { data: rows } = await db
    .from("accounts")
    .select("id")
    .eq("game_name", data.gameName)
    .eq("edition", data.edition)
    .ilike("login", (data.email ?? "").trim());

  if (!rows || rows.length === 0) return json({ success: false });

  const occupied = data.newValue !== "";
  const patch: Record<string, boolean> = {};
  patch[field] = occupied;
  await db.from("accounts").update(patch).eq("id", rows[0].id);

  // Фиксируем ручное действие в истории слота (в общий журнал не пишем)
  const baseSlot = (data.slotName ?? "").toString().trim();
  await db.from("orders").insert({
    login: (data.email ?? "").toString().trim(),
    game_name: data.gameName ?? "",
    edition: data.edition ?? "",
    client: occupied ? "Слот занят вручную" : "Слот освобождён вручную",
    slot: baseSlot,
    slot_field: field,
    event: occupied ? "manual_occupy" : "manual_free",
    created_at: new Date().toISOString(),
  });

  return json({ success: true });
}

async function handleAddEmptyAccount(data: any) {
  const email = (data.email ?? "").toString().trim();
  const region = (data.region ?? "").toString().trim().toUpperCase();

  if (!email) return json({ success: false, error: "Введите почту" });
  if (!region) return json({ success: false, error: "Выберите регион" });

  const { data: existing } = await db
    .from("empty_accounts")
    .select("id, region, status, is_problem")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("empty_accounts")
      .update({ region, status: "Свободен", is_problem: false })
      .eq("id", existing.id);
    if (error) return json({ success: false, error: error.message });
    await logActivity("empty", "empty_update", "Пустой аккаунт обновлён", {
      details: region,
      login: email,
      actor: data.actor,
      refId: existing.id,
      undo: {
        prev: {
          region: existing.region,
          status: existing.status,
          is_problem: existing.is_problem,
        },
      },
    });
    return json({ success: true });
  }

  const { data: inserted, error } = await db
    .from("empty_accounts")
    .insert({ email, region, status: "Свободен", is_problem: false })
    .select("id")
    .single();

  if (error) return json({ success: false, error: error.message });
  await logActivity("empty", "empty_add", "Добавлен пустой аккаунт", {
    details: region,
    login: email,
    actor: data.actor,
    refId: inserted.id,
  });
  return json({ success: true });
}

async function handleMarkProblem(data: any, value: boolean) {
  const email = (data.email ?? "").trim().toLowerCase();
  const { data: rows } = await db
    .from("empty_accounts")
    .select("id")
    .ilike("email", email);

  if (!rows || rows.length === 0) return json({ error: "Аккаунт не найден" });

  await db
    .from("empty_accounts")
    .update({ is_problem: value })
    .eq("id", rows[0].id);

  await logActivity(
    "empty",
    value ? "empty_trash" : "empty_restore",
    value ? "Пустой аккаунт перенесён в корзину" : "Пустой аккаунт восстановлен из корзины",
    { login: data.email, actor: data.actor, refId: rows[0].id },
  );
  return json({ success: true });
}

// ---------- Оплата через Cardlink ----------

// Статусы, после которых платёж уже не меняется
const PAYMENT_FINAL = new Set(["SUCCESS", "OVERPAID", "FAIL"]);
// Старые неоплаченные платежи больше не опрашиваем
const PAYMENT_POLL_MS = 3 * 24 * 60 * 60 * 1000;

// Статус платежа Cardlink по открытому адресу, которым пользуется сама страница оплаты.
// В отличие от API, он не требует IP из вайтлиста. Ответ: {"status":"NEW"}
async function fetchPaymentStatus(paymentId: string) {
  const response = await fetch(`https://cardlink.link/check_status/${encodeURIComponent(paymentId)}`, {
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  });
  const body = await response.json().catch(() => ({}));
  const status = str(body.status).toUpperCase();
  if (!response.ok || !status) throw new Error(`Cardlink ответил ${response.status}`);
  return status;
}

async function refreshPaymentStatus(row: any) {
  const status = await fetchPaymentStatus(row.bill_id);
  if (status === row.status) return;
  row.status = status;
  row.updated_at = new Date().toISOString();
  await db.from("payments").update({ status, updated_at: row.updated_at }).eq("id", row.id);
}

// Платежи по QR СБП создаёт робот — у них ссылка qr.nspk.ru и номер платежа Cardlink в bill_id
function isSbpPayment(row: any) {
  return String(row.link_url ?? "").startsWith("https://qr.nspk.ru/");
}

async function handleCreatePayment(data: any) {
  if (!CARDLINK_TRANSFER_URL || !SBP_ROBOT_URL || !SBP_ROBOT_KEY) {
    return json({ success: false, error: "Оплата по СБП не настроена на сервере" }, 500);
  }
  const clientName = str(data.clientName);
  const amount = Math.round(Number(String(data.amount ?? "").replace(",", ".")) * 100) / 100;
  if (!clientName) return json({ success: false, error: "Укажите имя клиента" }, 400);
  if (!(amount > 0)) return json({ success: false, error: "Укажите сумму" }, 400);

  let robot: any;
  try {
    const response = await fetch(SBP_ROBOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-robot-key": SBP_ROBOT_KEY },
      body: JSON.stringify({ transferUrl: CARDLINK_TRANSFER_URL, amount: amount.toFixed(2) }),
    });
    robot = await response.json().catch(() => ({}));
    if (!response.ok || !robot.success) throw new Error(robot.error || `робот ответил ${response.status}`);
  } catch (e) {
    return json({ success: false, error: `Не удалось получить QR: ${(e as Error).message}` }, 502);
  }

  // Номер платежа Cardlink — последняя часть адреса страницы «Оплата по реквизитам»
  const paymentId = new URL(robot.pageUrl).pathname.split("/").filter(Boolean).pop() ?? "";
  const { data: row, error } = await db
    .from("payments")
    .insert({
      bill_id: paymentId,
      client_name: clientName,
      amount,
      link_url: robot.sbpUrl,
      created_by: data.actor,
    })
    .select()
    .single();
  if (error) throw error;
  return json({ success: true, payment: row });
}

// История за выбранный день (from/to — границы дня по времени телефона, ISO).
// Статусы неоплаченных уточняем у Cardlink.
async function handleGetPayments(data: any) {
  const from = new Date(str(data.from));
  const to = new Date(str(data.to));
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return json({ success: false, error: "Не указан день" }, 400);
  }

  const { data: rows, error } = await db
    .from("payments")
    .select("*, postback:cardlink_postbacks(fields, created_at)")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const now = Date.now();
  const pending = (rows ?? []).filter(
    (p) => isSbpPayment(p) && !PAYMENT_FINAL.has(p.status) && now - new Date(p.created_at).getTime() < PAYMENT_POLL_MS,
  );
  await Promise.all(
    pending.map((p) =>
      refreshPaymentStatus(p).catch(() => {
        // Не получилось узнать статус — покажем последний известный
      }),
    ),
  );

  return json({ success: true, payments: (rows ?? []).map(withDetails) });
}

// Подробности платежа для раскрытой строки истории — из уведомления Cardlink, без запросов в API.
// Номера транзакции в уведомлении нет: он известен только для QR из приложения.
function withDetails(row: any) {
  const { postback, ...payment } = row;
  const fields = postback?.fields ?? {};
  const number = (value: unknown) => (str(value) === "" ? null : Number(value));
  return {
    ...payment,
    details: {
      transaction_id: isSbpPayment(row) ? row.bill_id : null,
      paid_at: postback?.created_at ?? null,
      method: str(fields.AccountType) || (isSbpPayment(row) ? "SBP" : null),
      bank: str(fields.AccountBank) || row.bank || null,
      amount: number(fields.OutSum) ?? Number(row.amount),
      commission: number(fields.Commission),
      balance_amount: number(fields.BalanceAmount),
      error_message: str(fields.ErrorMessage) || null,
    },
  };
}

// ---------- API Cardlink через прокси ----------

function concatBytes(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function indexOfHeaderEnd(bytes: Uint8Array) {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i;
  }
  return -1;
}

async function writeAll(conn: Deno.Conn, bytes: Uint8Array) {
  let written = 0;
  while (written < bytes.length) written += await conn.write(bytes.subarray(written));
}

function dechunk(bytes: Uint8Array) {
  const parts: Uint8Array[] = [];
  const dec = new TextDecoder();
  let pos = 0;
  while (pos < bytes.length) {
    let lineEnd = pos;
    while (lineEnd + 1 < bytes.length && !(bytes[lineEnd] === 13 && bytes[lineEnd + 1] === 10)) lineEnd++;
    const size = parseInt(dec.decode(bytes.subarray(pos, lineEnd)).split(";")[0], 16);
    if (!size) break;
    parts.push(bytes.subarray(lineEnd + 2, lineEnd + 2 + size));
    pos = lineEnd + 2 + size + 2;
  }
  return concatBytes(parts);
}

// HTTPS-запрос через HTTP-прокси (туннель CONNECT). Cardlink пускает только IP из вайтлиста,
// а у функции IP меняется, поэтому ходим через Fixie с постоянными адресами.
async function fetchViaProxy(
  target: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  proxyUrl = FIXIE_URL,
  timeoutMs = PROXY_TIMEOUT_MS,
): Promise<{ status: number; text: string }> {
  const proxy = new URL(proxyUrl);
  const enc = new TextEncoder();
  const conn = await Deno.connect({ hostname: proxy.hostname, port: Number(proxy.port || 80) });
  let stream: Deno.Conn = conn;
  const timer = setTimeout(() => {
    try {
      stream.close();
    } catch (_e) {
      // уже закрыто
    }
  }, timeoutMs);

  try {
    const auth = btoa(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`);
    await writeAll(
      conn,
      enc.encode(
        `CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n` +
          `Proxy-Authorization: Basic ${auth}\r\n\r\n`,
      ),
    );

    const buf = new Uint8Array(4096);
    let head = new Uint8Array(0);
    while (indexOfHeaderEnd(head) < 0) {
      const n = await conn.read(buf);
      if (n === null) throw new Error("прокси закрыл соединение");
      head = concatBytes([head, buf.slice(0, n)]);
    }
    const proxyStatus = new TextDecoder().decode(head).split("\r\n")[0];
    if (!/^HTTP\/1\.[01] 200/.test(proxyStatus)) throw new Error(`прокси ответил: ${proxyStatus}`);

    stream = await Deno.startTls(conn, { hostname: target.hostname });
    const bodyBytes = enc.encode(body);
    const lines = [
      `${method} ${target.pathname}${target.search} HTTP/1.1`,
      `Host: ${target.hostname}`,
      "Connection: close",
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      ...(method === "POST" ? [`Content-Length: ${bodyBytes.length}`] : []),
    ];
    await writeAll(stream, concatBytes([enc.encode(lines.join("\r\n") + "\r\n\r\n"), bodyBytes]));

    const parts: Uint8Array[] = [];
    while (true) {
      const n = await stream.read(buf);
      if (n === null) break;
      parts.push(buf.slice(0, n));
    }
    const raw = concatBytes(parts);
    const headerEnd = indexOfHeaderEnd(raw);
    if (headerEnd < 0) throw new Error("пустой ответ");
    const responseHead = new TextDecoder().decode(raw.subarray(0, headerEnd));
    let responseBody = raw.subarray(headerEnd + 4);
    if (/\r\ntransfer-encoding:\s*chunked/i.test(responseHead)) responseBody = dechunk(responseBody);

    return {
      status: Number(responseHead.split(" ")[1]) || 0,
      text: new TextDecoder().decode(responseBody),
    };
  } finally {
    clearTimeout(timer);
    try {
      stream.close();
    } catch (_e) {
      // уже закрыто
    }
  }
}

async function cardlink(method: "GET" | "POST", path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const target = new URL(`${CARDLINK_API}${path}${method === "GET" ? `?${query}` : ""}`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CARDLINK_TOKEN}`,
    Accept: "application/json",
    ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
  };
  const payload = method === "POST" ? query.toString() : "";

  let status: number;
  let text: string;
  if (FIXIE_URL) {
    ({ status, text } = await fetchViaProxy(target, method, headers, payload));
  } else {
    const response = await fetch(target, { method, headers, body: payload || undefined });
    status = response.status;
    text = await response.text();
  }

  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch (_e) {
    body = {};
  }
  if (status < 200 || status >= 300 || body.success === false || body.success === "false") {
    throw new Error(body.message || body.error || `Cardlink ответил ${status}`);
  }
  return body;
}

// Баланс магазина в Cardlink — запрашивается только по кнопке, каждый раз один запрос через прокси
async function handleGetBalance() {
  if (!CARDLINK_TOKEN || !FIXIE_URL) {
    return json({ success: false, error: "Баланс не настроен на сервере" }, 500);
  }
  try {
    const result = await cardlink("GET", "/merchant/balance", {});
    return json({ success: true, balances: Array.isArray(result.balances) ? result.balances : [] });
  } catch (e) {
    return json({ success: false, error: `Не удалось получить баланс: ${(e as Error).message}` }, 502);
  }
}

async function md5Hex(text: string) {
  const digest = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Уведомление Cardlink об оплате (Result URL). Приходит без токена входа,
// поэтому проверяем подпись: UPPER(md5(OutSum:InvId:apiToken))
async function handleCardlinkPostback(req: Request) {
  const raw = await req.text();
  let fields: Record<string, string>;
  try {
    fields = JSON.parse(raw);
  } catch (_e) {
    fields = Object.fromEntries(new URLSearchParams(raw));
  }

  const expected = await md5Hex(`${str(fields.OutSum)}:${str(fields.InvId)}:${CARDLINK_TOKEN}`);
  const signatureOk = Boolean(CARDLINK_TOKEN) && str(fields.SignatureValue).toUpperCase() === expected.toUpperCase();
  // Журнал уведомлений как есть — без подписи
  const { SignatureValue: _signature, ...logged } = fields;
  const { data: log, error } = await db
    .from("cardlink_postbacks")
    .insert({ fields: logged, signature_ok: signatureOk })
    .select("id")
    .single();
  if (error) throw error;
  if (!signatureOk) return new Response("bad signature", { status: 403 });

  if (str(fields.Status)) await applyPostback(log.id, fields);
  return new Response("OK");
}

// Сколько после создания QR его оплату (или отказ — неоплаченный QR Cardlink отклоняет не сразу)
// ещё можно связать с уведомлением
const POSTBACK_MATCH_MS = 24 * 60 * 60 * 1000;

// Уведомление → строка истории. Номера платежа в уведомлении нет (TrsId — номер многоразовой
// ссылки, общий для всех платежей), поэтому QR из приложения ищем по сумме среди недавних
// и сверяем его статус у Cardlink. Не нашли — платёж прошёл мимо приложения, добавляем его.
async function applyPostback(postbackId: number, fields: Record<string, string>) {
  const status = str(fields.Status).toUpperCase();
  const amount = Number(fields.OutSum) || 0;
  const details = {
    status,
    bank: str(fields.AccountBank) || null,
    payer_account: str(fields.AccountNumber) || null,
    postback_id: postbackId,
    updated_at: new Date().toISOString(),
  };

  const { data: candidates, error } = await db
    .from("payments")
    .select("id, bill_id")
    .is("postback_id", null)
    .like("link_url", "https://qr.nspk.ru/%")
    .eq("amount", amount)
    .gte("created_at", new Date(Date.now() - POSTBACK_MATCH_MS).toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;

  for (const row of candidates ?? []) {
    const cardlinkStatus = await fetchPaymentStatus(row.bill_id).catch(() => "");
    if (cardlinkStatus === status) {
      const { error: updateError } = await db.from("payments").update(details).eq("id", row.id);
      if (updateError) throw updateError;
      return;
    }
  }

  const { error: insertError } = await db.from("payments").insert({
    ...details,
    bill_id: `postback-${postbackId}`,
    client_name: "",
    amount,
    link_url: "",
    created_by: "Cardlink",
  });
  if (insertError) throw insertError;
}

// ---------- Чаты Авито ----------

// Ключ доступа живёт сутки; держим его в памяти функции и берём новый заранее
let avitoToken: { value: string; expiresAt: number } | null = null;
let avitoUserId: number | null = null;

async function getAvitoToken(force = false) {
  if (!force && avitoToken && avitoToken.expiresAt > Date.now() + 60_000) return avitoToken.value;
  if (!AVITO_CLIENT_ID || !AVITO_CLIENT_SECRET) throw new Error("Ключи Авито не настроены на сервере");
  const response = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AVITO_CLIENT_ID,
      client_secret: AVITO_CLIENT_SECRET,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Авито не выдало доступ (${response.status})`);
  }
  avitoToken = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return avitoToken.value;
}

async function avito(method: "GET" | "POST", path: string, payload?: unknown) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAvitoToken(attempt > 0);
    const response = await fetch(`${AVITO_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
    // Ключ мог истечь раньше срока — один раз берём новый
    if (response.status === 401 && attempt === 0) continue;
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_e) {
      data = {};
    }
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `Авито ответило ${response.status}`);
    }
    return data;
  }
  throw new Error("Авито не принимает ключ доступа");
}

async function getAvitoUserId() {
  if (avitoUserId) return avitoUserId;
  const me = await avito("GET", "/core/v1/accounts/self");
  avitoUserId = Number(me.id);
  return avitoUserId;
}

// Текст сообщения для списка и переписки — у нетекстовых сообщений подпись по типу
function avitoMessageText(message: any) {
  const c = message?.content ?? {};
  switch (message?.type) {
    case "text":
      return str(c.text);
    case "image":
      return "📷 Фото";
    case "item":
      return `Объявление: ${str(c.item?.title)}`;
    case "link":
      return str(c.link?.text) || str(c.link?.url);
    case "location":
      return `📍 ${str(c.location?.text) || str(c.location?.title)}`;
    case "call":
      return "📞 Пропущенный звонок";
    case "voice":
      return "🎤 Голосовое сообщение";
    case "deleted":
      return "Сообщение удалено";
    default:
      return str(c.text) || "Системное сообщение";
  }
}

// Самая крупная картинка из набора размеров ("1280x960": url, ...)
function avitoLargestImage(sizes: Record<string, string> | undefined) {
  const entries = Object.entries(sizes ?? {});
  if (entries.length === 0) return "";
  entries.sort((a, b) => {
    const area = (key: string) => key.split("x").reduce((n, v) => n * (Number(v) || 0), 1);
    return area(b[0]) - area(a[0]);
  });
  return entries[0][1];
}

function avitoChatSummary(chat: any, myId: number, unread = false) {
  const other = (chat.users ?? []).find((u: any) => Number(u.id) !== myId) ?? {};
  const item = chat.context?.type === "item" ? chat.context.value ?? {} : {};
  const last = chat.last_message;
  return {
    id: chat.id,
    name: str(other.name) || "Пользователь Авито",
    avatar: str(other.public_user_profile?.avatar?.default),
    itemTitle: str(item.title),
    itemPrice: str(item.price_string),
    itemImage: str(item.images?.main?.["140x105"]),
    itemUrl: str(item.url),
    lastText: last ? avitoMessageText(last) : "",
    lastDirection: str(last?.direction),
    updated: Number(chat.updated || last?.created || chat.created) || 0,
    unread,
  };
}

const AVITO_CHATS_PAGE = 50;

async function handleAvitoChats(data: any) {
  const uid = await getAvitoUserId();
  await ensureAvitoWebhook().catch((e) => console.error("avito subscribe:", (e as Error).message));
  const offset = Math.max(0, Number(data.offset) || 0);
  const base = `/messenger/v2/accounts/${uid}/chats?chat_types=u2i,u2u`;
  // Непрочитанные отдельным запросом: в общем списке отметки «прочитано» нет
  const [all, unread] = await Promise.all([
    avito("GET", `${base}&limit=${AVITO_CHATS_PAGE}&offset=${offset}`),
    avito("GET", `${base}&limit=100&unread_only=true`),
  ]);
  const unreadIds = new Set((unread.chats ?? []).map((c: any) => c.id));
  const chats = (all.chats ?? []).map((c: any) => avitoChatSummary(c, uid, unreadIds.has(c.id)));
  return json({ success: true, chats, hasMore: (all.chats ?? []).length === AVITO_CHATS_PAGE });
}

async function handleAvitoMessages(data: any) {
  const uid = await getAvitoUserId();
  const chatId = encodeURIComponent(str(data.chatId));
  if (!chatId) return json({ success: false, error: "Не указан чат" }, 400);
  const [chat, list] = await Promise.all([
    avito("GET", `/messenger/v2/accounts/${uid}/chats/${chatId}`),
    avito("GET", `/messenger/v3/accounts/${uid}/chats/${chatId}/messages/?limit=100`),
  ]);
  // Получение сообщений не отмечает чат прочитанным — делаем это явно
  if (data.markRead !== false) {
    await avito("POST", `/messenger/v1/accounts/${uid}/chats/${chatId}/read`).catch(() => {});
  }
  const messages = (Array.isArray(list) ? list : list.messages ?? [])
    .map((m: any) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      text: m.type === "image" ? "" : avitoMessageText(m),
      image: m.type === "image" ? avitoLargestImage(m.content?.image?.sizes) : "",
      created: Number(m.created) || 0,
      isRead: Boolean(m.is_read),
    }))
    .sort((a: any, b: any) => a.created - b.created);
  return json({ success: true, chat: avitoChatSummary(chat, uid), messages });
}

async function handleAvitoSend(data: any) {
  const uid = await getAvitoUserId();
  const chatId = encodeURIComponent(str(data.chatId));
  const text = str(data.text);
  if (!chatId || !text) return json({ success: false, error: "Пустое сообщение" }, 400);
  const sent = await avito("POST", `/messenger/v1/accounts/${uid}/chats/${chatId}/messages`, {
    message: { text },
    type: "text",
  });
  return json({
    success: true,
    message: {
      id: sent.id,
      direction: "out",
      type: "text",
      text: str(sent.content?.text) || text,
      image: "",
      created: Number(sent.created) || Math.floor(Date.now() / 1000),
      isRead: false,
    },
  });
}

// ---------- Веб-хук Авито ----------

function avitoWebhookUrl() {
  return `${SUPABASE_URL}/functions/v1/api?avito=webhook&key=${encodeURIComponent(AVITO_WEBHOOK_KEY)}`;
}

// Подписка на уведомления: проверяем один раз на экземпляр функции, подписываемся, если нашего адреса нет
let avitoWebhookChecked = false;
async function ensureAvitoWebhook() {
  if (avitoWebhookChecked || !AVITO_WEBHOOK_KEY) return;
  const url = avitoWebhookUrl();
  const current = await avito("POST", "/messenger/v1/subscriptions");
  const subscribed = (current.subscriptions ?? []).some((sub: any) => sub.url === url);
  if (!subscribed) await avito("POST", "/messenger/v3/webhook", { url });
  avitoWebhookChecked = true;
}

// Уведомление Авито о новом сообщении: сохраняем событие, приложение по нему обновит чаты.
// Отвечаем 200 всегда и быстро (у Авито таймаут 2 секунды), иначе оно перестанет слать уведомления
async function handleAvitoWebhook(req: Request, key: string) {
  if (!AVITO_WEBHOOK_KEY || key !== AVITO_WEBHOOK_KEY) return new Response("forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));
  const value = body?.payload?.value;
  if (body?.payload?.type === "message" && value?.chat_id) {
    const { error } = await db.from("avito_events").insert({
      message_id: str(value.id) || null,
      chat_id: str(value.chat_id),
      author_id: Number(value.author_id) || null,
      type: str(value.type),
      text: str(value.content?.text),
      payload: body,
    });
    // Повтор того же уведомления упрётся в unique message_id — это нормально
    if (error && error.code !== "23505") console.error("avito webhook:", error.message);
  }
  return new Response("ok");
}

// Последнее событие веб-хука (и по какому чату) — приложение сравнивает и перезагружает чаты
async function handleAvitoEvents() {
  const { data, error } = await db
    .from("avito_events")
    .select("id, chat_id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return json({ success: true, lastId: data?.id ?? 0, lastChatId: data?.chat_id ?? "" });
}

// Ошибки Авито показываем в приложении текстом, а не как сбой сервера
async function avitoAction(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const params = new URL(req.url).searchParams;
    if (params.get("cardlink") === "postback") {
      return await handleCardlinkPostback(req);
    }
    if (params.get("avito") === "webhook") {
      return await handleAvitoWebhook(req, params.get("key") ?? "");
    }

    let data: any = {};
    if (req.method === "POST") {
      try {
        data = await req.json();
      } catch (_e) {
        data = {};
      }
      if (data.action === "login") {
        return json(await login(str(data.login), String(data.password ?? "")));
      }
      if (data.action === "register") {
        return json(await register(str(data.login), String(data.password ?? ""), str(data.code)));
      }
      // Программа с компьютера входит не как сотрудник, а по своему ключу
      if (data.action === "phoneAgent") {
        return await handlePhoneAgent(data);
      }
    }

    // Всё, кроме входа и регистрации, — только с действующим токеном
    const user = await verifyToken(req.headers.get("x-app-token"));
    if (!user) {
      return json({ success: false, error: "Нужно войти заново", code: "unauthorized" }, 401);
    }
    if (ADMIN_ACTIONS.has(data.action) && user.role !== "admin") {
      return json({ success: false, error: "Недостаточно прав", code: "forbidden" }, 403);
    }
    // Кто сделал действие — берём из токена, а не из того, что прислал браузер
    data.actor = user.name || user.login;
    data.actorLogin = user.login;
    data.actorRole = user.role;

    if (req.method === "GET") {
      const catalog = await buildCatalog();
      return json(catalog);
    }

    if (req.method === "POST") {
      switch (data.action) {
        case "addGame":
        case "add":
          return await handleAddGame(data);
        case "addEdition":
          return await handleAddEdition(data);
        case "updatePrices":
          return await handleUpdatePrices(data);
        case "updateStandardPrices":
          return await handleUpdateStandardPrices(data);
        case "cdkOrders":
          return await handleCdkOrders(data);
        case "gptAccounts":
          return await handleGptAccounts(data);
        case "phoneTasks":
          return await handlePhoneTasks(data);
        case "updateGame":
          return await handleUpdateGame(data);
        case "backfillCovers":
          return await handleBackfillCovers();
        case "addAccount":
          return await handleAddAccount(data);
        case "addOrder":
          return await handleAddOrder(data);
        case "getSlotHistory":
          return await handleGetSlotHistory(data);
        case "getActivity":
          return await handleGetActivity(data);
        case "getActivityItem":
          return await handleGetActivityItem(data);
        case "updateActivity":
          return await handleUpdateActivity(data);
        case "deleteActivity":
          return await handleDeleteActivity(data);
        case "restoreActivity":
          return await handleRestoreActivity(data);
        case "getAccountInfo":
          return await handleGetAccountInfo(data);
        case "updateAccountExpense":
          return await handleUpdateAccountExpense(data);
        case "toggleSlot":
          return await handleToggleSlot(data);
        case "updateSlotNote":
          return await handleUpdateSlotNote(data);
        case "deleteAccount":
          return await handleDeleteAccount(data);
        case "updateAccountLogin":
          return await handleUpdateAccountLogin(data);
        case "updateOrderPrice":
          return await handleUpdateOrderPrice(data);
        case "deleteGame":
          return await handleDeleteGame(data);
        case "psSearch":
          return await handlePsSearch(data);
        case "psRegionPrices":
          return await handlePsRegionPrices(data);
        case "setAccountReset":
          return await handleSetAccountReset(data);
        case "avitoChats":
          return await avitoAction(() => handleAvitoChats(data));
        case "avitoMessages":
          return await avitoAction(() => handleAvitoMessages(data));
        case "avitoSend":
          return await avitoAction(() => handleAvitoSend(data));
        case "avitoEvents":
          return await handleAvitoEvents();
        case "addEmptyAccount":
          return await handleAddEmptyAccount(data);
        case "markProblem":
          return await handleMarkProblem(data, true);
        case "unmarkProblem":
          return await handleMarkProblem(data, false);
        case "createPayment":
          return await handleCreatePayment(data);
        case "getBalance":
          return await handleGetBalance();
        case "getPayments":
          return await handleGetPayments(data);
        default:
          return json({ error: "Неизвестное действие" }, 400);
      }
    }

    return json({ error: "Метод не поддерживается" }, 405);
  } catch (err) {
    await sendTG("🚨 <b>КРИТИЧЕСКАЯ ОШИБКА api:</b>\n" + String(err));
    return json({ error: String(err) }, 500);
  }
});
