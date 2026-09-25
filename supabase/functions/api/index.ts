import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TG_TOKEN = Deno.env.get("TG_TOKEN") ?? "";
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID") ?? "";

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

async function getPSImageUrl(gameName: string): Promise<string> {
  const name = (gameName ?? "").trim();
  if (!name) return "";

  const query = encodeURIComponent(name);
  const searchUrl = `https://store.playstation.com/en-tr/search/${query}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) return "";

    const html = await response.text();
    const match = html.match(
      /src="([^"]+image\.api\.playstation\.com\/vulcan\/ap\/rnd\/[^"]+)"/,
    );

    if (match && match[1]) {
      let imageUrl = match[1];
      if (imageUrl.includes("?")) imageUrl = imageUrl.split("?")[0];
      return imageUrl;
    }
    return "";
  } catch (_e) {
    return "";
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
  const [catalogRes, accountsRes, emptyRes, empRes, payRes, curRes, regRes] =
    await Promise.all([
      db.from("catalog_items").select("*"),
      db.from("accounts").select("*").order("created_at", { ascending: true }),
      db.from("empty_accounts").select("*"),
      db.from("employees").select("name").order("sort_order"),
      db.from("payment_methods").select("name").order("sort_order"),
      db.from("currencies").select("name").order("sort_order"),
      db.from("regions").select("code, emoji").order("sort_order"),
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
    accMap[key][ed].push({
      email: (a.login ?? "").trim() || "Без почты",
      slots: [
        { isOccupied: toBool(a.slot1) },
        { isOccupied: toBool(a.slot2) },
        { isOccupied: toBool(a.slot3) },
        { isOccupied: toBool(a.slot4) },
        { isOccupied: toBool(a.slot5) },
      ],
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

// Журнал изменений — только для администратора
const ADMIN_ACTIONS = new Set([
  "getActivity",
  "getActivityItem",
  "updateActivity",
  "deleteActivity",
  "restoreActivity",
]);

function slotFieldForBase(base: string) {
  if (base === "PS4 П3") return "slot4";
  if (base === "PS4 П2") return "slot5";
  if (base === "PS5 П2" || base === "П2") return "slot3";
  return null;
}

async function applySlot(row: any, slotName: string) {
  const isReturn = slotName.toLowerCase().indexOf("возврат") !== -1;
  const base = slotName.replace(/возврат\s*/i, "").trim();
  const valToSet = !isReturn;

  let targetField: string | null = null;

  if (base === "PS5 П3" || base === "П3") {
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
) {
  const found = await findAccountByLogin(loginValue);

  if (found) {
    track.slot = await applySlot(found, slotStr);
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
    );
  } catch (err) {
    hasErrors = true;
    slotErrorMsg = (err as Error).message;
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
    .select("client, slot, created_at, price, event")
    .ilike("login", target)
    .order("created_at", { ascending: true });

  const history = (rows ?? []).map((r: any) => ({
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
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
    }

    // Всё, кроме входа, — только с действующим токеном
    const user = await verifyToken(req.headers.get("x-app-token"));
    if (!user) {
      return json({ success: false, error: "Нужно войти заново", code: "unauthorized" }, 401);
    }
    if (ADMIN_ACTIONS.has(data.action) && user.role !== "admin") {
      return json({ success: false, error: "Недостаточно прав", code: "forbidden" }, 403);
    }
    // Кто сделал действие — берём из токена, а не из того, что прислал браузер
    data.actor = user.name || user.login;

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
        case "addEmptyAccount":
          return await handleAddEmptyAccount(data);
        case "markProblem":
          return await handleMarkProblem(data, true);
        case "unmarkProblem":
          return await handleMarkProblem(data, false);
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
