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
  "Access-Control-Allow-Headers": "*",
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

async function login(loginValue: string, password: string) {
  const { data } = await db
    .from("app_users")
    .select("login, password, role, name")
    .eq("login", loginValue)
    .maybeSingle();

  if (data && String(data.password) === String(password)) {
    return { success: true, role: data.role, name: data.name };
  }
  return { success: false, message: "Неверный логин или пароль" };
}

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

async function clearEmptyAccount(loginValue: string) {
  await db
    .from("empty_accounts")
    .delete()
    .ilike("email", loginValue.trim().toLowerCase());
}

async function allocateSlot(
  loginValue: string,
  gameName: string,
  edition: string,
  slotStr: string,
  expense: string,
  currency: string,
  purchaseDate: string,
) {
  const found = await findAccountByLogin(loginValue);

  if (found) {
    await applySlot(found, slotStr);
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
  await applySlot(inserted, slotStr);
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

  const { error } = await db.from("catalog_items").insert({
    type,
    name,
    has_ps5: data.hasPS5 !== undefined ? data.hasPS5 : true,
    has_ps4: data.hasPS4 !== undefined ? data.hasPS4 : true,
    cover_url: coverUrl,
    editions,
  });

  if (error) return json({ error: error.message });

  await logActivity("game", isSub ? "Добавлена подписка" : "Добавлена игра", {
    details: editions.length ? `${name} · ${editions.join(", ")}` : name,
    gameName: name,
    actor: data.actor,
  });

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
    await logActivity("game", "Подтянуты обложки", {
      details: `Обновлено: ${updated}`,
    });
  }

  return json({ success: true, updated, failed });
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

  await logActivity("game", "Добавлено издание", {
    details: gameLabel(name, newEdition),
    gameName: name,
    actor: data.actor,
  });
  return json({ success: true });
}

async function handleAddAccount(data: any) {
  const finalDate = resolveDate(data.manualDate);
  const kind = (await isSubscriptionName(data.gameName)) ? "подписки" : "игры";

  const rate = await getRate(data.currency);
  const fiat = parseFloat(String(data.expense).replace(",", ".")) || 0;

  const { error } = await db.from("accounts").insert({
    kind,
    game_name: data.gameName,
    edition: data.edition ?? "",
    login: data.login,
    purchase_date: finalDate,
    expense_fiat: fiat,
    currency: data.currency ?? "",
    rate,
  });

  if (error) return json({ error: error.message });

  await clearEmptyAccount(data.login);

  const total = fiat * rate;
  await logActivity("account", "Добавлен аккаунт", {
    details: gameLabel(data.gameName, data.edition) +
      (total ? ` · расход ${Math.round(total)} ₽` : ""),
    login: data.login,
    gameName: data.gameName,
    actor: data.actor || data.employee,
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

  const { error: orderError } = await db.from("orders").insert({
    login: data.login,
    game_name: data.gameName,
    edition: data.edition,
    client: data.client,
    slot: data.slot,
    price: data.price === "" || data.price === undefined
      ? null
      : Number(String(data.price).replace(",", ".")),
    payment_method: data.paymentMethod ?? "",
    employee: data.employee ?? "",
    created_at: finalDate,
  });

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

  try {
    await allocateSlot(
      data.login,
      data.gameName,
      data.edition,
      data.slot,
      data.expense,
      data.currency,
      finalDate,
    );
  } catch (err) {
    hasErrors = true;
    slotErrorMsg = (err as Error).message;
  }

  try {
    await clearEmptyAccount(data.login);
  } catch (_err) {
    hasErrors = true;
    cleanError = true;
  }

  const isReturn = String(data.slot).toLowerCase().indexOf("возврат") !== -1;
  const orderPrice = Number(String(data.price ?? "").replace(",", "."));
  await logActivity("order", isReturn ? "Возврат" : "Новый заказ", {
    details: [gameLabel(data.gameName, data.edition), data.slot, data.client]
      .filter(Boolean)
      .join(" · "),
    login: data.login,
    gameName: data.gameName,
    actor: data.actor || data.employee,
    price: data.price === "" || isNaN(orderPrice) ? null : orderPrice,
  });

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
async function logActivity(
  type: string,
  title: string,
  fields: {
    details?: string;
    login?: string;
    gameName?: string;
    actor?: string;
    price?: number | null;
  } = {},
) {
  try {
    await db.from("activity_log").insert({
      type,
      title,
      details: fields.details ?? "",
      login: (fields.login ?? "").toString().trim(),
      game_name: fields.gameName ?? "",
      actor: (fields.actor ?? "").toString().trim(),
      price: fields.price ?? null,
    });
  } catch (_e) {
    return;
  }
}

function gameLabel(gameName: string, edition?: string) {
  return edition ? `${gameName} (${edition})` : gameName;
}

async function handleGetActivity(data: any) {
  const offset = Math.max(0, Number(data.offset) || 0);

  let q = db
    .from("activity_log")
    .select("id, type, title, details, login, game_name, actor, price, created_at");

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
  if (data.type && data.type !== "all") q = q.eq("type", data.type);

  const { data: rows, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + ACTIVITY_PAGE_SIZE - 1);

  if (error) return json({ success: false, error: error.message });

  const events = (rows ?? []).map((r: any) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    details: r.details ?? "",
    login: r.login ?? "",
    gameName: r.game_name ?? "",
    actor: r.actor ?? "",
    price: r.price,
    createdAt: r.created_at,
  }));

  return json({
    success: true,
    events,
    hasMore: events.length === ACTIVITY_PAGE_SIZE,
  });
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

  if (newName !== oldName) {
    await db
      .from("accounts")
      .update({ game_name: newName })
      .eq("game_name", oldName)
      .eq("kind", type);
    await db
      .from("orders")
      .update({ game_name: newName })
      .eq("game_name", oldName);
  }

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
    await logActivity("game", "Изменена игра", {
      details: `${newName} · ${changes.join("; ")}`,
      gameName: newName,
      actor: data.actor,
    });
  }

  return json({ success: true });
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
    .update({ expense_fiat: value, rate: 1, currency: "RUB" })
    .ilike("login", login.toLowerCase());

  if (data.gameName) q = q.eq("game_name", data.gameName);
  if (data.edition !== undefined && data.edition !== null) {
    q = q.eq("edition", data.edition);
  }

  const { error } = await q;
  if (error) return json({ success: false, error: error.message });

  await logActivity("account", "Изменён расход аккаунта", {
    details: [data.gameName && gameLabel(data.gameName, data.edition), `${value} ₽`]
      .filter(Boolean)
      .join(" · "),
    login,
    gameName: data.gameName ?? "",
    actor: data.actor,
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

  // Фиксируем ручное действие в истории слота
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

  await logActivity(
    "slot",
    occupied ? "Слот занят вручную" : "Слот освобождён вручную",
    {
      details: [gameLabel(data.gameName ?? "", data.edition), baseSlot]
        .filter(Boolean)
        .join(" · "),
      login: data.email,
      gameName: data.gameName ?? "",
      actor: data.actor,
    },
  );

  return json({ success: true });
}

async function handleAddEmptyAccount(data: any) {
  const email = (data.email ?? "").toString().trim();
  const region = (data.region ?? "").toString().trim().toUpperCase();

  if (!email) return json({ success: false, error: "Введите почту" });
  if (!region) return json({ success: false, error: "Выберите регион" });

  const { data: existing } = await db
    .from("empty_accounts")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("empty_accounts")
      .update({ region, status: "Свободен", is_problem: false })
      .eq("id", existing.id);
    if (error) return json({ success: false, error: error.message });
    await logActivity("empty", "Пустой аккаунт обновлён", {
      details: region,
      login: email,
      actor: data.actor,
    });
    return json({ success: true });
  }

  const { error } = await db
    .from("empty_accounts")
    .insert({ email, region, status: "Свободен", is_problem: false });

  if (error) return json({ success: false, error: error.message });
  await logActivity("empty", "Добавлен пустой аккаунт", {
    details: region,
    login: email,
    actor: data.actor,
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
    value ? "Пустой аккаунт перенесён в корзину" : "Пустой аккаунт восстановлен из корзины",
    { login: data.email, actor: data.actor },
  );
  return json({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action");
      if (action === "login") {
        const result = await login(
          url.searchParams.get("login") ?? "",
          url.searchParams.get("password") ?? "",
        );
        return json(result);
      }
      const catalog = await buildCatalog();
      return json(catalog);
    }

    if (req.method === "POST") {
      let data: any = {};
      try {
        data = await req.json();
      } catch (_e) {
        data = {};
      }

      switch (data.action) {
        case "addGame":
        case "add":
          return await handleAddGame(data);
        case "addEdition":
          return await handleAddEdition(data);
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
