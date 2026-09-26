import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { X, QrCode, Loader2, Download, Check, Plus, RotateCw } from "lucide-react";
import { API_URL, apiFetch } from "../config";

// Платёж, созданный через приложение (строка нашей базы)
type Payment = {
  id: string;
  bill_id: string;
  client_name: string;
  amount: number;
  link_url: string;
  status: string;
  created_at: string;
  // Банк плательщика — приходит в уведомлении Cardlink после оплаты
  bank?: string | null;
};

// Статусы счёта Cardlink
const STATUS: Record<string, { label: string; color: string }> = {
  NEW: { label: "Ожидаем оплату", color: "text-amber-400 bg-amber-400/10 border-amber-400/25" },
  PROCESS: { label: "В процессе", color: "text-sky-400 bg-sky-400/10 border-sky-400/25" },
  SUCCESS: { label: "Оплачено", color: "text-[#12c83b] bg-[#12c83b]/10 border-[#12c83b]/25" },
  OVERPAID: { label: "Переплата", color: "text-[#12c83b] bg-[#12c83b]/10 border-[#12c83b]/25" },
  UNDERPAID: { label: "Недоплата", color: "text-orange-400 bg-orange-400/10 border-orange-400/25" },
  FAIL: { label: "Не оплачено", color: "text-red-400 bg-red-400/10 border-red-400/25" },
};

const REFRESH_MS = 10_000;
// Сколько дней показывать в фильтре по датам
const HISTORY_DAYS = 30;

// Начало дня по времени телефона: 0 — сегодня, 1 — вчера и т.д.
function dayStart(daysAgo: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function dayLabel(daysAgo: number) {
  if (daysAgo === 0) return "Сегодня";
  return dayStart(daysAgo).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

const rub = (value: number) => `${Number(value).toLocaleString("ru-RU")} ₽`;

// Знак Системы быстрых платежей
const SBP_LOGO_PATHS = [
  ["#5B57A2", "M0 26.12l14.532 25.975v15.844L.017 93.863z"],
  ["#D90751", "M55.797 42.643l13.617-8.346 27.868-.026-41.485 25.414z"],
  ["#FAB718", "M55.72 25.967l.077 34.39-14.566-8.95V0z"],
  ["#ED6F26", "M97.282 34.271l-27.869.026-13.693-8.33L41.231 0z"],
  ["#63B22F", "M55.797 94.007V77.322l-14.566-8.78.008 51.458z"],
  ["#1487C9", "M69.38 85.737L14.531 52.095 0 26.12l97.223 59.583z"],
  ["#017F36", "M41.24 120l14.556-25.993 13.583-8.27 27.843-.034z"],
  ["#984995", "M.017 93.863l41.345-25.32-13.9-8.526-12.93 7.922z"],
];

function SbpLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 97.3 120" className={className} aria-label="СБП">
      {SBP_LOGO_PATHS.map(([fill, d]) => (
        <path key={d} fill={fill} d={d} />
      ))}
    </svg>
  );
}

// Тот же знак картинкой — для центра QR-кода
const SBP_LOGO_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 137.3 140"><rect x="-20" y="-10" width="137.3" height="140" rx="20" fill="#fff"/>${SBP_LOGO_PATHS.map(
      ([fill, d]) => `<path fill="${fill}" d="${d}"/>`,
    ).join("")}</svg>`,
  );

// Картинка для скачивания: белая карточка как на экране — знак СБП, QR, сумма, подсказка
const CARD_W = 900;
const CARD_H = 1110;
const QR_BOX = 640;
const QR_SIZE = 592;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось подготовить картинку"));
    img.src = src;
  });
}

function svgToDataUri(svg: SVGSVGElement, size: number) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("width", String(size));
  copy.setAttribute("height", String(size));
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
}

const SBP_LOGO_ONLY_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 97.3 120">${SBP_LOGO_PATHS.map(
      ([fill, d]) => `<path fill="${fill}" d="${d}"/>`,
    ).join("")}</svg>`,
  );

async function renderQrCard(qrSvg: SVGSVGElement, amount: number) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const [logo, qr] = await Promise.all([loadImage(SBP_LOGO_ONLY_URI), loadImage(svgToDataUri(qrSvg, QR_SIZE))]);
  ctx.drawImage(logo, 60, 56, 70, 86);
  ctx.fillStyle = "#1d1d1f";
  ctx.font = `600 32px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Система", 152, 82);
  ctx.fillText("быстрых платежей", 152, 120);

  const boxX = (CARD_W - QR_BOX) / 2;
  const boxY = 190;
  ctx.strokeStyle = "rgba(91, 87, 162, 0.2)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, QR_BOX, QR_BOX, 40);
  ctx.stroke();
  ctx.drawImage(qr, boxX + (QR_BOX - QR_SIZE) / 2, boxY + (QR_BOX - QR_SIZE) / 2, QR_SIZE, QR_SIZE);

  ctx.textAlign = "center";
  ctx.font = `700 88px ${font}`;
  ctx.fillText(rub(amount), CARD_W / 2, 940);
  ctx.fillStyle = "#737373";
  ctx.font = `400 32px ${font}`;
  ctx.fillText("Отсканируйте камерой телефона", CARD_W / 2, 1015);
  ctx.fillText("или в приложении банка", CARD_W / 2, 1057);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сохранить картинку"))), "image/png"),
  );
}

// На iPhone скачанный файл уходит в «Файлы», а не в «Фото» — там сохраняем через меню «Поделиться»
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function saveImage(blob: Blob, fileName: string) {
  const file = new File([blob], fileName, { type: "image/png" });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inputClass =
  "w-full h-14 bg-white/[0.04] border border-white/10 rounded-[18px] px-5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors placeholder:text-neutral-600";


function fmtDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: "text-neutral-400 bg-white/5 border-white/10" };
  return (
    <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[12px] font-semibold ${s.color}`}>
      {s.label}
    </span>
  );
}

async function post(body: object) {
  const response = await apiFetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  return response.json();
}

export function PaymentQrModal({ onClose }: { onClose: () => void }) {
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [current, setCurrent] = useState<Payment | null>(null);
  const [saved, setSaved] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const [daysAgo, setDaysAgo] = useState(0);
  // Номер последнего запроса: ответ за прошлый выбранный день не должен затереть текущий
  const requestRef = useRef(0);

  const loadPayments = async (day = daysAgo) => {
    const request = ++requestRef.current;
    setIsRefreshing(true);
    try {
      const result = await post({
        action: "getPayments",
        from: dayStart(day).toISOString(),
        to: dayStart(day - 1).toISOString(),
      });
      if (request !== requestRef.current) return;
      if (result.success) {
        setHistory(result.payments);
        setHistoryError("");
      } else {
        setHistoryError(result.error || "Не удалось загрузить платежи");
      }
    } catch {
      if (request === requestRef.current) setHistoryError("Нет связи с сервером");
    } finally {
      if (request === requestRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Пока окно открыто, перечитываем историю выбранного дня — сервер заодно уточняет статусы у Cardlink
  useEffect(() => {
    setIsLoading(true);
    setHistory([]);
    loadPayments(daysAgo);
    const timer = setInterval(() => loadPayments(daysAgo), REFRESH_MS);
    return () => clearInterval(timer);
  }, [daysAgo]);

  const createPayment = async () => {
    setError("");
    if (!clientName.trim()) return setError("Укажите имя клиента");
    if (!(Number(amount.replace(",", ".")) > 0)) return setError("Укажите сумму");

    setIsCreating(true);
    try {
      const result = await post({ action: "createPayment", clientName, amount });
      if (!result.success) throw new Error(result.error || "Не удалось создать счёт");
      setCurrent(result.payment);
      setClientName("");
      setAmount("");
      // Новый платёж — сегодняшний: переключаемся на «Сегодня» (или просто обновляем)
      if (daysAgo === 0) loadPayments(0);
      else setDaysAgo(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const openPayment = (item: Payment) => {
    if (!item.link_url) return;
    setCurrent(item);
  };

  const downloadQr = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!current || !svg) return;
    try {
      const blob = await renderQrCard(svg, current.amount);
      const name = current.client_name.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "client";
      await saveImage(blob, `qr-sbp-${name}-${current.amount}.png`);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Пользователь закрыл меню «Поделиться» или браузер не дал сохранить
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", damping: 30, stiffness: 320 }}
      className="fixed inset-0 z-[300] max-w-md mx-auto flex flex-col h-[100dvh] bg-[#0f0f10]"
    >
      <div
        className="shrink-0 flex items-center gap-3 px-5 pb-4 bg-[#1a1a1c] border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 16px)" }}
      >
        <div className="w-12 h-12 rounded-full border border-white/10 bg-white flex items-center justify-center shrink-0">
          <SbpLogo className="h-7 w-auto" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-neutral-500 font-medium">Cardlink</div>
          <div className="text-[22px] font-bold text-white leading-tight truncate">Оплата по СБП</div>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="h-12 w-12 rounded-full border border-white/10 bg-white/[0.06] text-white flex items-center justify-center shrink-0"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-5 pt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {current ? (
          <div className="flex flex-col items-center gap-4 p-5 rounded-[28px] bg-[#1a1a1c] border border-white/5">
            <div className="w-full flex flex-col items-center px-5 pt-5 pb-4 bg-white rounded-[24px]">
              <div className="flex items-center gap-2.5 self-start">
                <SbpLogo className="h-8 w-auto" />
                <div className="text-[13px] font-semibold leading-[1.15] text-[#1d1d1f]">
                  Система
                  <br />
                  быстрых платежей
                </div>
              </div>
              <div ref={qrRef} className="mt-4 p-2 rounded-[16px] border-2 border-[#5B57A2]/20">
                <QRCodeSVG
                  value={current.link_url}
                  size={220}
                  level="H"
                  fgColor="#1d1d1f"
                  imageSettings={{ src: SBP_LOGO_DATA_URI, height: 48, width: 48, excavate: true }}
                />
              </div>
              <div className="mt-4 text-[30px] font-bold text-[#1d1d1f] leading-tight">{rub(current.amount)}</div>
              <div className="mt-1 text-[13px] text-neutral-500 text-center">
                Отсканируйте камерой телефона
                <br />
                или в приложении банка
              </div>
            </div>
            <div className="text-[15px] text-neutral-400">{current.client_name}</div>
            <div className="w-full flex gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={downloadQr}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className="flex-1 h-12 rounded-full border border-white/10 bg-white/[0.06] text-white text-[15px] flex items-center justify-center gap-2"
              >
                {saved ? <Check size={16} className="text-[#12c83b]" /> : <Download size={16} />}
                {saved ? "Сохранено" : "Скачать"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setCurrent(null)}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className="flex-1 h-12 rounded-full border border-[#12c83b]/30 bg-[#12c83b]/15 text-[#12c83b] text-[15px] font-semibold flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Новый платёж
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              className={inputClass}
              placeholder="Имя клиента"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Сумма, ₽"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            />
            {error && <div className="px-2 text-[14px] text-red-400">{error}</div>}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={createPayment}
              disabled={isCreating}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className="h-14 rounded-[18px] bg-[#12c83b] text-black text-[16px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isCreating ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
              {isCreating ? "Получаем QR… ~15 сек" : "Получить QR СБП"}
            </motion.button>
          </div>
        )}

        <div className="mt-8 mb-3 px-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">
            История платежей
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => loadPayments()}
            disabled={isRefreshing}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.06] text-neutral-400 flex items-center justify-center"
          >
            <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          </motion.button>
        </div>

        <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        <div className="-mx-5 mb-3 px-5 flex gap-2 overflow-x-auto hide-scrollbar touch-pan-x">
          {Array.from({ length: HISTORY_DAYS }, (_, day) => (
            <motion.button
              key={day}
              whileTap={{ scale: 0.92 }}
              onClick={() => setDaysAgo(day)}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`shrink-0 h-9 px-4 rounded-full border text-[14px] font-semibold transition-colors ${
                day === daysAgo
                  ? "bg-[#12c83b]/15 border-[#12c83b]/40 text-[#12c83b]"
                  : "bg-white/[0.04] border-white/10 text-neutral-400"
              }`}
            >
              {dayLabel(day)}
            </motion.button>
          ))}
        </div>

        {historyError && <div className="mb-3 px-1 text-[13px] text-red-400">{historyError}</div>}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin text-neutral-500" />
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-[14px] text-neutral-600">
            {daysAgo === 0 ? "Сегодня платежей пока нет" : `За ${dayLabel(daysAgo)} платежей нет`}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((p) => {
              const canOpen = Boolean(p.link_url);
              return (
                <motion.button
                  key={p.id}
                  whileTap={canOpen ? { scale: 0.98 } : undefined}
                  onClick={() => openPayment(p)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-[18px] border text-left transition-colors ${
                    p.id === current?.id
                      ? "bg-white/[0.07] border-white/15"
                      : "bg-white/[0.03] border-white/5"
                  } ${canOpen ? "" : "cursor-default"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-semibold truncate ${p.client_name ? "text-white" : "text-neutral-500"}`}>
                      {p.client_name || "Без имени"}
                    </div>
                    <div className="text-[12px] text-neutral-500 truncate">
                      {fmtDate(p.created_at)}
                      {p.bank ? ` · ${p.bank}` : ""}
                    </div>
                  </div>
                  <div className="text-[15px] font-semibold text-white shrink-0">{rub(p.amount)}</div>
                  <StatusBadge status={p.status} />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
