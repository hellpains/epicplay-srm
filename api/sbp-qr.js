// Vercel-функция: получить прямую ссылку СБП по многоразовой ссылке Cardlink.
// Вызывает её только сервер Supabase (функция api) с секретным ключом SBP_ROBOT_KEY.
import "./_lib/lambdaEnv.js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { getSbpLink } from "./_lib/cardlinkRobot.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Метод не поддерживается" });
  }
  const key = process.env.SBP_ROBOT_KEY;
  if (!key || req.headers["x-robot-key"] !== key) {
    return res.status(401).json({ success: false, error: "Нет доступа" });
  }

  const { transferUrl, amount } = req.body ?? {};
  if (typeof transferUrl !== "string" || !transferUrl.startsWith("https://cardlink.link/transfer/")) {
    return res.status(400).json({ success: false, error: "Неверная ссылка оплаты" });
  }
  if (!(Number(amount) > 0)) {
    return res.status(400).json({ success: false, error: "Неверная сумма" });
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const result = await getSbpLink(browser, transferUrl, amount);
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    return res.status(502).json({ success: false, error: e.message });
  } finally {
    await browser.close().catch(() => {});
  }
}
