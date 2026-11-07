// Программа-посредник между сайтом и телефоном с PS App, подключённым к этому компьютеру по USB.
// Раз в несколько секунд спрашивает у сервера задание (раздел «Долги партнёров») и выполняет его
// на телефоне через adb: войти в сохранённый аккаунт или ввести код с экрана консоли.
// Запуск: npm run phone-agent. Нужны VITE_SUPABASE_URL и PHONE_AGENT_KEY в .env / .env.local.
//
// Кнопки ищем только по их именам в приложении, а не по месту на экране: в настройках PS App
// под «Выйти» стоит «Закрыть учетную запись», и промахнуться туда нельзя.
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PS_APP = "com.scee.psxandroid";
const POLL_MS = 3000;
// Сколько ждём появления следующего экрана
const SCREEN_MS = 40_000;

// ---------- Настройки ----------

function readEnv() {
  const env = {};
  for (const name of [".env", ".env.local"]) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = readEnv();
const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const API_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : (env.VITE_API_URL ?? "");
const AGENT_KEY = env.PHONE_AGENT_KEY ?? "";
const ADB =
  [env.ADB_PATH, join(process.env.LOCALAPPDATA ?? "", "Android/Sdk/platform-tools/adb.exe")].find(
    (path) => path && existsSync(path)
  ) ?? "adb";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (text) => console.log(`${new Date().toLocaleTimeString("ru-RU")} ${text}`);

// Ошибка шага: её текст увидит админ на сайте
class StepError extends Error {}

// ---------- Телефон ----------

function adbFor(timeout, ...args) {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

const adb = (...args) => adbFor(30_000, ...args);
const shell = (command) => adb("shell", command);

const unescapeXml = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

// Что сейчас на экране: элементы с текстом, именем в приложении и серединой, по которой нажимать
async function screen() {
  let xml = "";
  for (let attempt = 0; attempt < 3 && !xml.includes("<hierarchy"); attempt++) {
    xml = await adb("exec-out", "uiautomator", "dump", "/dev/tty").catch(() => "");
    if (!xml.includes("<hierarchy")) await sleep(700);
  }
  const nodes = [];
  for (const [tag] of xml.matchAll(/<node [^>]*>/g)) {
    const attribute = (name) => unescapeXml(tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? "");
    const bounds = attribute("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bounds) continue;
    const [left, top, right, bottom] = bounds.slice(1).map(Number);
    nodes.push({
      id: attribute("resource-id").split("/").pop(),
      text: attribute("text"),
      desc: attribute("content-desc"),
      kind: attribute("class").split(".").pop(),
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
      top,
      bottom,
    });
  }
  return nodes;
}

const byId = (id) => (node) => node.id === id;

// Тексты экрана одной строкой — в сообщение об ошибке, чтобы было видно, где остановились
const screenText = (nodes) =>
  [...new Set(nodes.map((node) => node.text || node.desc).filter(Boolean))].join(" · ").slice(0, 220);

// Ждёт, пока на экране появится элемент, подходящий под одну из проверок; возвращает её имя и элемент
async function waitFor(checks, step, timeout = SCREEN_MS) {
  let nodes = [];
  for (const until = Date.now() + timeout; Date.now() < until; ) {
    nodes = await screen();
    for (const [name, check] of Object.entries(checks)) {
      const node = nodes.find(check);
      if (node) return { name, node, nodes };
    }
    await sleep(800);
  }
  throw new StepError(`Не получилось на шаге «${step}». На экране: ${screenText(nodes) || "ничего не прочиталось"}`);
}

const tap = (node) => shell(`input tap ${node.x} ${node.y}`);

// Печатает текст в поле, на котором стоит курсор, — по одной букве с неровными паузами, как человек,
// а не всю строку за мгновение. Сама команда ввода на телефоне занимает около полсекунды на букву,
// к этому добавляем случайную паузу. Кавычки — для оболочки телефона: в паролях бывают $ и &
function type(text) {
  const keys = [...text].map((char) => {
    const key = char === " " ? "%s" : char.replace(/'/g, "'\\''");
    const pause = (0.05 + Math.random() * 0.3).toFixed(2);
    return `input text '${key}'; sleep ${pause}`;
  });
  // Все буквы — одной командой: телефон сам выдерживает паузы, связь с компьютером на них не влияет
  return adbFor(30_000 + text.length * 2000, "shell", keys.join("; "));
}

// Прячет клавиатуру, если она открыта: она закрывает кнопки внизу страницы
async function hideKeyboard() {
  const state = await shell("dumpsys input_method").catch(() => "");
  if (/mInputShown=true/.test(state)) {
    await shell("input keyevent KEYCODE_BACK");
    await sleep(700);
  }
}

async function wake() {
  const devices = (await adb("devices")).split(/\r?\n/).filter((line) => /\tdevice$/.test(line));
  if (devices.length === 0) throw new StepError("Телефон не подключён к компьютеру или не разрешил отладку по USB");
  await shell("input keyevent KEYCODE_WAKEUP");
  await sleep(500);
  const locked = async () => /isKeyguardShowing=true/.test(await shell("dumpsys window"));
  if (await locked()) {
    await shell("input swipe 540 1900 540 600 250");
    await sleep(1200);
    if (await locked()) throw new StepError("Телефон заблокирован: разблокируйте его и повторите");
  }
}

// Открывает PS App с начала и ждёт его первого экрана: «Вход» или главный экран вошедшего аккаунта
async function openApp() {
  await shell(`am force-stop ${PS_APP}`);
  await shell(`monkey -p ${PS_APP} -c android.intent.category.LAUNCHER 1`).catch(() => "");
  return afterSignIn("открыть PS App", { signIn: byId("sign-in-button") });
}

// После входа приложение не сразу пускает на главный экран: спрашивает согласие на использование данных
// и просит выбрать консоль для сопряжения. Согласие подтверждаем, консоль оставляем ту, что предложена
// (пропустить этот экран нельзя, а выбор потом меняется в настройках), и ждём главный экран
async function afterSignIn(step, more = {}) {
  const checks = {
    home: byId("play-component-settings-icon"),
    consent: byId("gdpr-prompt-confirm-button"),
    pairing: byId("linked-console-navigation"),
    ...more,
  };
  for (let screens = 0; screens < 4; screens++) {
    const found = await waitFor(checks, step);
    if (found.name === "consent") {
      await tap(found.node);
      delete checks.consent;
    } else if (found.name === "pairing") {
      await tap(found.node);
      await tap((await waitFor({ confirm: byId("navigation-primary-button") }, "выбор консоли")).node);
      delete checks.pairing;
    } else {
      return found;
    }
    await sleep(1500);
  }
  throw new StepError(`Не получилось на шаге «${step}»: приложение не дошло до главного экрана`);
}

// Открывает настройки PS App и листает до пункта с нужным именем
async function openSetting(id, step) {
  const { node: gear } = await waitFor({ gear: byId("play-component-settings-icon") }, step);
  await tap(gear);
  await sleep(1500);
  const size = (await shell("wm size")).match(/(\d+)x(\d+)/);
  const height = size ? Number(size[2]) : 2340;
  let nodes = [];
  for (let swipes = 0; swipes < 12; swipes++) {
    nodes = await screen();
    const item = nodes.find(byId(id));
    // Пункт целиком на экране, а не под панелью внизу
    if (item && item.top > height * 0.12 && item.bottom < height * 0.84) return item;
    await shell(`input swipe 540 ${Math.round(height * 0.75)} 540 ${Math.round(height * 0.4)} 300`);
    await sleep(800);
  }
  throw new StepError(`Не получилось на шаге «${step}»: в настройках PS App нет нужного пункта. На экране: ${screenText(nodes)}`);
}

// ---------- Код 2FA (TOTP, RFC 6238: SHA-1, 30 секунд, 6 цифр) ----------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function totpCode(key, now) {
  const clean = key.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length < 16 || [...clean].some((char) => !BASE32.includes(char))) return "";
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = ((value << 5) | BASE32.indexOf(char)) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ---------- Задания ----------

// Вход в аккаунт. Если в PS App открыт другой аккаунт — сначала выходим из него
async function login(task) {
  await wake();
  let found = await openApp();
  if (found.name === "home") {
    await tap(await openSetting("settings-sign-out-button", "выйти из прежнего аккаунта"));
    found = await waitFor({ signIn: byId("sign-in-button") }, "выйти из прежнего аккаунта");
  }
  await tap(found.node);

  const { node: emailField } = await waitFor({ email: byId("signin-entrance-input-signinId") }, "страница входа Sony");
  await tap(emailField);
  await sleep(800);
  // Страница могла запомнить прежнюю почту
  if (emailField.text) await shell(`input keyevent KEYCODE_MOVE_END ${"KEYCODE_DEL ".repeat(emailField.text.length)}`);
  await type(task.email);
  await sleep(500);
  await tap((await waitFor({ next: byId("signin-entrance-button") }, "почта")).node);

  const { node: passwordField } = await waitFor({ password: byId("signin-password-input-password") }, "почта");
  await tap(passwordField);
  await sleep(800);
  await type(task.password);
  await sleep(500);
  await tap((await waitFor({ signIn: byId("signin-password-button") }, "пароль")).node);

  // Дальше — код 2FA (поле на новой странице) либо сразу приложение
  found = await afterSignIn("пароль", {
    code: (node) => node.kind === "EditText" && !node.id.startsWith("signin-"),
  });
  if (found.name === "code") {
    if (!totpCode(task.totp, Date.now())) {
      throw new StepError("Sony просит код 2FA, а ключа 2FA у сохранённого аккаунта нет или он неверный");
    }
    // Код, который вот-вот сменится, может не успеть — ждём следующий
    // (сам ввод шести цифр теперь занимает несколько секунд)
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (left < 14) await sleep((left + 1) * 1000);
    await tap(found.node);
    await sleep(800);
    await type(totpCode(task.totp, Date.now()));
    await hideKeyboard();
    const confirm = (await screen()).find((node) => node.kind === "Button" && node.text === "Подтвердить");
    if (!confirm) throw new StepError("Не получилось на шаге «код 2FA»: нет кнопки «Подтвердить»");
    await tap(confirm);
    found = await afterSignIn("код 2FA");
  }
  return "";
}

// Код с экрана консоли: настройки → «Отсканировать QR-код» → «Ввести код вручную»
async function consoleCode(task) {
  await wake();
  const opened = await openApp();
  if (opened.name === "signIn") throw new StepError("В PS App на телефоне не выполнен вход в аккаунт");
  await tap(await openSetting("settings-device-management-sign-in-ps5", "настройки"));

  // Первый раз телефон спрашивает разрешение на камеру
  let found = await waitFor(
    {
      manual: byId("enter-code-manually-button"),
      permission: (node) => /^permission_allow_(foreground_only_)?button$/.test(node.id),
    },
    "отсканировать QR-код"
  );
  if (found.name === "permission") {
    await tap(found.node);
    found = await waitFor({ manual: byId("enter-code-manually-button") }, "отсканировать QR-код");
  }
  await tap(found.node);

  const { node: field } = await waitFor({ field: byId("textbox-textfield") }, "ввести код вручную");
  await tap(field);
  await sleep(800);
  await type(task.code);
  await sleep(500);
  await tap((await waitFor({ ok: byId("navigation-primary-button") }, "ввести код вручную")).node);

  // Что показало приложение после «OK». На неверный или просроченный код оно через пару секунд
  // показывает окно с жёлтым знаком «Не удалось войти в сеть»
  await sleep(1500);
  let nodes = [];
  const said = () =>
    nodes
      .filter((node) => node.id === "illustration-title" || node.id === "illustration-message")
      .map((node) => node.text)
      .join(" ");
  for (const until = Date.now() + 15_000; Date.now() < until; ) {
    nodes = await screen();
    if (nodes.some((node) => node.desc === "error-message-caution")) {
      const text = said();
      // Закрываем окно, чтобы следующий код вводился с чистого экрана
      const ok = nodes.filter(byId("navigation-primary-button")).pop();
      if (ok) await tap(ok);
      throw new StepError(`PS App не принял код: ${text || "консоль его не узнала"}`);
    }
    // Поле кода закрылось, и появился другой экран — код принят
    if (!nodes.some(byId("textbox-textfield")) && nodes.some(byId("illustration-title"))) break;
    await sleep(800);
  }
  if (nodes.some(byId("textbox-textfield"))) {
    throw new StepError(`PS App не ответил на код. На экране: ${screenText(nodes)}`);
  }
  // Как выглядит экран после верного кода, заранее неизвестно — показываем админу, что там написано
  return said();
}

// ---------- Связь с сервером ----------

async function api(body) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "phoneAgent", agentKey: AGENT_KEY, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || `ответ ${response.status}`);
  return result;
}

async function run(task) {
  log(`задание: ${task.kind === "login" ? `войти в ${task.email}` : "ввести код консоли"}`);
  let status = "done";
  let message = "";
  try {
    message = task.kind === "login" ? await login(task) : await consoleCode(task);
  } catch (error) {
    status = "error";
    message = error instanceof StepError ? error.message : `Сбой программы: ${error.message}`;
  }
  log(status === "done" ? "готово" : `не вышло: ${message}`);
  await api({ op: "finish", id: task.id, status, message }).catch((error) => log(`итог не записался: ${error.message}`));
}

// Проверка без сервера: node agent/phone-agent.mjs --test задание.json
// (в файле то же, что присылает сервер: kind, email, password, totp или code)
// Проверка скорости ввода: node agent/phone-agent.mjs --type "текст" — печатает его в поле под курсором
const typeAt = process.argv.indexOf("--type");
if (typeAt > 0) {
  const started = Date.now();
  await type(process.argv[typeAt + 1]);
  log(`напечатано за ${((Date.now() - started) / 1000).toFixed(1)} с`);
  process.exit();
}
const testAt = process.argv.indexOf("--test");
if (testAt > 0) {
  const task = JSON.parse(readFileSync(process.argv[testAt + 1], "utf8").replace(/^﻿/, ""));
  try {
    await (task.kind === "console_code" ? consoleCode(task) : login(task));
    log("готово");
  } catch (error) {
    log(`не вышло: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}

if (!API_URL || !AGENT_KEY) {
  console.error("Нужны VITE_SUPABASE_URL и PHONE_AGENT_KEY в .env или .env.local");
  process.exit(1);
}
log(`программа запущена, adb: ${ADB}`);
let silent = false;
for (;;) {
  try {
    const { task } = await api({ op: "next" });
    silent = false;
    if (task) await run(task);
  } catch (error) {
    // О сбое связи пишем один раз, а не каждые три секунды
    if (!silent) log(`сервер не отвечает: ${error.message}`);
    silent = true;
  }
  await sleep(POLL_MS);
}
