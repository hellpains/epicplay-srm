// Робот для многоразовой ссылки Cardlink: вводит сумму, нажимает «Продолжить» и «Оплатить»
// и забирает со страницы «Оплата по реквизитам» прямую ссылку СБП (qr.nspk.ru).
// API Cardlink такую ссылку не отдаёт — она есть только на странице оплаты.

const NSPK_RE = /https:\/\/qr\.nspk\.ru\/[A-Za-z0-9]+(?:\?[^"'\s<>\\]*)?/;
const STEP_TIMEOUT_MS = 20_000;

function decodeHtmlLink(link) {
  return link.replace(/&amp;/g, "&").replace(/&quot;.*$/, "");
}

export async function getSbpLink(browser, transferUrl, amount) {
  const page = await browser.newPage();
  try {
    // Картинки и шрифты роботу не нужны — так страница грузится быстрее
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(transferUrl, { waitUntil: "networkidle2", timeout: STEP_TIMEOUT_MS });
    await page.waitForSelector("#amount", { visible: true, timeout: STEP_TIMEOUT_MS });
    await page.click("#amount", { clickCount: 3 });
    await page.type("#amount", String(amount));

    await clickButton(page, (text) => text === "Продолжить");
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.innerText.trim().startsWith("Оплатить")),
      { timeout: STEP_TIMEOUT_MS },
    );

    // Кнопка «Оплатить» появляется раньше, чем страница готова её принять
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: STEP_TIMEOUT_MS });
    await clickButton(page, (text) => text.startsWith("Оплатить"));

    // После «Оплатить» страница уходит на /transfer/requisites/… — ждём ссылку СБП в ней
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      if (!page.url().includes("/requisites/")) continue;
      const html = await page.content().catch(() => "");
      const match = html.match(NSPK_RE);
      if (match) return { sbpUrl: decodeHtmlLink(match[0]), pageUrl: page.url() };
    }
    throw new Error("Cardlink не показал QR СБП");
  } finally {
    await page.close().catch(() => {});
  }
}

async function clickButton(page, matches) {
  const clicked = await page.evaluate((source) => {
    const test = new Function("text", `return (${source})(text)`);
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.offsetParent !== null && test(b.innerText.trim()),
    );
    button?.click();
    return Boolean(button);
  }, matches.toString());
  if (!clicked) throw new Error("не нашёл кнопку на странице Cardlink");
}
