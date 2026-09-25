import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { apiFetch } from "../config";

// Логотипы — simple-icons (CC0)
function PlayStationIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z" />
    </svg>
  );
}

function XboxIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z" />
    </svg>
  );
}

// Флаги рисуем SVG: эмодзи-флаги на Windows показываются буквами "UA"/"TR"
function UkraineFlag() {
  return (
    <svg viewBox="0 0 30 20" width={27} height={18} className="rounded-[3px]" aria-hidden="true">
      <rect width="30" height="10" fill="#0057B7" />
      <rect y="10" width="30" height="10" fill="#FFD700" />
    </svg>
  );
}

function TurkeyFlag() {
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 2.5 : 1;
    const a = Math.PI + (i * Math.PI) / 5;
    return `${17.6 + r * Math.cos(a)},${10 + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 30 20" width={27} height={18} className="rounded-[3px]" aria-hidden="true">
      <rect width="30" height="20" fill="#E30A17" />
      <circle cx="10" cy="10" r="5" fill="#fff" />
      <circle cx="11.25" cy="10" r="4" fill="#E30A17" />
      <polygon points={star} fill="#fff" />
    </svg>
  );
}

type Platform = "playstation" | "xbox";

const PLATFORMS: { id: Platform; label: string; Icon: typeof PlayStationIcon }[] = [
  { id: "playstation", label: "PlayStation", Icon: PlayStationIcon },
  { id: "xbox", label: "Xbox", Icon: XboxIcon },
];

type Region = { id: string; label: string; currency: string; Flag: typeof UkraineFlag };

const REGIONS: Record<Platform, Region[]> = {
  playstation: [
    { id: "ua", label: "Украина", currency: "UAH", Flag: UkraineFlag },
    { id: "tr", label: "Турция", currency: "TRY", Flag: TurkeyFlag },
  ],
  xbox: [
    { id: "ua", label: "Украина", currency: "UAH", Flag: UkraineFlag },
    { id: "tr", label: "Турция", currency: "TRY", Flag: TurkeyFlag },
  ],
};

const SECTIONS = [
  { id: "psplus", icon: "🎮", label: "PlayStation Plus" },
  { id: "topup", icon: "💳", label: "Пополнение" },
];

const rubFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

const PS_PLUS_MONTHS = [1, 3, 12];
// name — как тариф пишется в тексте для клиента; title — заголовок при копировании строки тарифа
const PS_PLUS_TIERS = [
  { id: "Essential", name: "Essential", title: "Ps Plus Essential", className: "bg-white border-white text-black" },
  { id: "Extra", name: "Extra", title: "Ps Plus Extra", className: "bg-[#f5d31a] border-[#f5d31a] text-black" },
  { id: "Deluxe", name: "Deluxe", title: "Ps Plus Deluxe", className: "bg-transparent border-[#f5d31a]/70 text-[#f5d31a]" },
  { id: "EA Play", name: "Ea Play", title: "Ea Play", className: "bg-[#ea3950] border-[#ea3950] text-white" },
];
type Tier = (typeof PS_PLUS_TIERS)[number];

function monthsLabel(months: number) {
  const mod10 = months % 10;
  const mod100 = months % 100;
  if (mod10 === 1 && mod100 !== 11) return `${months} месяц`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${months} месяца`;
  return `${months} месяцев`;
}

// Тексты для клиента. Незаданные цены пропускаются; если цен нет совсем — пустая строка.
function allPricesText(region: string, prices: Record<string, number>) {
  const blocks = PS_PLUS_TIERS.map((tier) => {
    const lines = PS_PLUS_MONTHS.filter((m) => prices[`${tier.id}|${m}`]).map(
      (m) => `${monthsLabel(m)} - ${prices[`${tier.id}|${m}`]} рублей`
    );
    return lines.length ? [`Тариф ${tier.name}`, ...lines].join("\n") : "";
  }).filter(Boolean);
  if (!blocks.length) return "";
  return [`Ps Plus и Ea Play ${region}`, ...blocks].join("\n\n");
}

function monthPricesText(region: string, months: number, prices: Record<string, number>) {
  const lines = PS_PLUS_TIERS.filter((tier) => prices[`${tier.id}|${months}`]).map(
    (tier) => `${tier.name} ${monthsLabel(months)} - ${prices[`${tier.id}|${months}`]} рублей`
  );
  if (!lines.length) return "";
  return [`Ps Plus и Ea Play ${region}`, "", ...lines].join("\n");
}

function tierPricesText(region: string, tier: Tier, prices: Record<string, number>) {
  const lines = PS_PLUS_MONTHS.filter((m) => prices[`${tier.id}|${m}`]).map(
    (m) => `${monthsLabel(m)} - ${prices[`${tier.id}|${m}`]} рублей`
  );
  if (!lines.length) return "";
  return [`${tier.title} ${region}`, "", ...lines].join("\n");
}

function singlePriceText(region: string, tier: Tier, months: number, prices: Record<string, number>) {
  const price = prices[`${tier.id}|${months}`];
  if (!price) return "";
  return `${tier.name} ${region}\n${monthsLabel(months)} - ${price} рублей`;
}

// Таблица PS Plus (+ EA Play): тариф × срок, цены в ₽. Ключ цены — "Essential|1"
function PsPlusTable({
  sectionKey,
  label,
  regionLabel,
  Flag,
  prices,
  apiUrl,
  onSaved,
}: {
  sectionKey: string;
  label: string;
  regionLabel: string;
  Flag: typeof UkraineFlag;
  prices: Record<string, number>;
  apiUrl: string;
  onSaved?: () => void;
}) {
  const [saved, setSaved] = useState(prices);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimeout = useRef<any>(null);

  useEffect(() => {
    if (!isEditing) setSaved(prices);
  }, [prices, isEditing]);

  const copy = (id: string, text: string) => {
    if (!text || isEditing) return;
    navigator.clipboard.writeText(text);
    setCopied(id);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(null), 1000);
  };

  // Ячейка-кнопка: копирует свой текст и на секунду подсвечивается зелёным
  const copyCell = (id: string, text: string, className: string, children: any) => (
    <motion.button
      key={id}
      whileTap={isEditing || !text ? undefined : { scale: 0.95 }}
      onTap={() => copy(id, text)}
      style={{ WebkitTapHighlightColor: "transparent" }}
      className={`cursor-pointer touch-manipulation select-none ${cellBase} transition-colors ${
        copied === id ? "bg-[#12c83b]/20 border-[#12c83b]/40 text-[#12c83b]" : className
      }`}
    >
      {copied === id ? <Check size={16} /> : children}
    </motion.button>
  );

  const startEditing = () => {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved)) values[key] = String(value);
    setDraft(values);
    setError("");
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({
          action: "updateStandardPrices",
          key: sectionKey,
          label,
          prices: draft,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setSaved(result.prices);
        setIsEditing(false);
        onSaved?.();
      } else {
        setError(result.error || "Не удалось сохранить цены");
      }
    } catch (e) {
      setError("Ошибка сети");
    } finally {
      setIsSaving(false);
    }
  };

  const cellBase = "h-11 rounded-xl border flex items-center justify-center text-[14px]";

  const priceCell = (tier: Tier, months: number) => {
    const key = `${tier.id}|${months}`;
    if (isEditing) {
      return (
        <input
          key={key}
          inputMode="numeric"
          placeholder="—"
          value={draft[key] ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, [key]: e.target.value.replace(/[^0-9]/g, "") }))
          }
          className={`${cellBase} w-full min-w-0 bg-[#1c1c1e] border-white/15 text-center text-[16px] font-medium text-white outline-none placeholder:text-neutral-600 focus:border-[#12c83b]/50`}
        />
      );
    }
    const price = saved[key];
    return copyCell(
      key,
      singlePriceText(regionLabel, tier, months, saved),
      `bg-white/5 border-white/10 tabular-nums ${price ? "text-white/85" : "text-neutral-600"}`,
      price ? `${price}₽` : "—"
    );
  };

  return (
    <div className="px-3 pb-3 pt-4 border-t border-white/5">
      <div className="grid grid-cols-4 gap-1.5">
        {copyCell("all", allPricesText(regionLabel, saved), "bg-white/5 border-white/10", <Flag />)}
        {PS_PLUS_MONTHS.map((months) =>
          copyCell(
            `month-${months}`,
            monthPricesText(regionLabel, months, saved),
            "bg-white/5 border-white/10 font-semibold text-white",
            `${months} мес`
          )
        )}

        {PS_PLUS_TIERS.map((tier) => [
          copyCell(`tier-${tier.id}`, tierPricesText(regionLabel, tier, saved), `font-bold ${tier.className}`, tier.id),
          ...PS_PLUS_MONTHS.map((months) => priceCell(tier, months)),
        ])}
      </div>

      {error && <div className="text-red-500 text-xs text-center mt-2">{error}</div>}

      <div className="flex gap-1.5 mt-2">
        {isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 active:scale-95 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="flex-1 h-10 rounded-xl bg-[#12c83b] text-black text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </>
        ) : (
          <button
            onClick={startEditing}
            className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Pencil size={13} /> Изменить цены
          </button>
        )}
      </div>
    </div>
  );
}

// Курс ступенями: столбец «от N (валюта) → ×K». Хранится в разделе "<платформа>|<регион>|rate"
// как {"from|N": K}; пока курс не сохраняли — стартовые значения.
const DEFAULT_RATE_PRICES: Record<string, number> = { "from|0": 5, "from|200": 4 };
const MIN_RATE_COLUMNS = 6;

type RateTier = { from: number; mult: number };

function parseRateTiers(prices: Record<string, number>): RateTier[] {
  return Object.entries(prices)
    .filter(([key]) => key.startsWith("from|"))
    .map(([key, value]) => ({ from: Number(key.slice(5)), mult: Number(value) }))
    .filter((tier) => Number.isFinite(tier.from) && tier.mult > 0)
    .sort((a, b) => a.from - b.from);
}

// Множитель для суммы — последний столбец, чей порог не больше суммы (ниже первого порога — первый столбец)
function multiplierFor(tiers: RateTier[], amount: number) {
  if (!tiers.length) return 0;
  let mult = tiers[0].mult;
  for (const tier of tiers) if (amount >= tier.from) mult = tier.mult;
  return mult;
}

const formatMult = (mult: number) => String(mult).replace(".", ",");

function RateTable({
  sectionKey,
  label,
  currency,
  prices,
  apiUrl,
  onSavedPrices,
  onSaved,
}: {
  sectionKey: string;
  label: string;
  currency: string;
  prices: Record<string, number>;
  apiUrl: string;
  onSavedPrices: (prices: Record<string, number>) => void;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<{ from: string; mult: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const tiers = parseRateTiers(prices);

  const startEditing = () => {
    const rows = tiers.map((tier) => ({ from: String(tier.from), mult: formatMult(tier.mult) }));
    while (rows.length < MIN_RATE_COLUMNS) rows.push({ from: "", mult: "" });
    setDraft(rows);
    setError("");
    setIsEditing(true);
  };

  const setCell = (index: number, field: "from" | "mult", value: string) =>
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const save = async () => {
    // Столбец без порога или без множителя не сохраняется — так его и удаляют
    const next: Record<string, string> = {};
    for (const row of draft) {
      if (row.from === "" || row.mult === "") continue;
      next[`from|${Number(row.from)}`] = row.mult.replace(",", ".");
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "updateStandardPrices", key: sectionKey, label, prices: next }),
      });
      const result = await response.json();
      if (result.success) {
        onSavedPrices(result.prices);
        setIsEditing(false);
        onSaved?.();
      } else {
        setError(result.error || "Не удалось сохранить курс");
      }
    } catch (e) {
      setError("Ошибка сети");
    } finally {
      setIsSaving(false);
    }
  };

  const cell = "h-11 rounded-xl border flex items-center justify-center text-[14px] tabular-nums";
  const input = `${cell} w-full min-w-0 bg-[#1c1c1e] border-white/15 text-center text-[16px] font-medium text-white outline-none placeholder:text-neutral-600 focus:border-[#12c83b]/50`;
  const rows: (RateTier | null)[] = [...tiers];
  while (rows.length < MIN_RATE_COLUMNS) rows.push(null);

  // Ступени идут строками сверху вниз: «от N» | «×K»
  return (
    <div className="pt-3 mt-2.5 border-t border-white/5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="h-7 flex items-center justify-center text-[12px] font-semibold text-neutral-500">
          от {currency}
        </div>
        <div className="h-7 flex items-center justify-center text-[12px] font-semibold text-neutral-500">курс</div>

        {isEditing
          ? draft.flatMap((row, i) => [
              <input
                key={`from-${i}`}
                inputMode="numeric"
                placeholder="—"
                value={row.from}
                onChange={(e) => setCell(i, "from", e.target.value.replace(/[^0-9]/g, ""))}
                className={input}
              />,
              <input
                key={`mult-${i}`}
                inputMode="decimal"
                placeholder="—"
                value={row.mult}
                onChange={(e) => setCell(i, "mult", e.target.value.replace(/[^0-9.,]/g, ""))}
                className={input}
              />,
            ])
          : rows.flatMap((tier, i) => [
              <div
                key={`from-${i}`}
                className={`${cell} bg-white/5 border-white/10 font-semibold ${tier ? "text-white" : "text-neutral-600"}`}
              >
                {tier ? tier.from : "—"}
              </div>,
              <div
                key={`mult-${i}`}
                className={`${cell} bg-white/5 border-white/10 ${tier ? "text-[#12c83b] font-bold" : "text-neutral-600"}`}
              >
                {tier ? `×${formatMult(tier.mult)}` : "—"}
              </div>,
            ])}
      </div>

      {error && <div className="text-red-500 text-xs text-center mt-2">{error}</div>}

      <div className="flex gap-1.5 mt-2">
        {isEditing ? (
          <>
            <button
              onClick={() => setDraft((prev) => [...prev, { from: "", mult: "" }])}
              disabled={isSaving}
              aria-label="Добавить столбец"
              className="w-10 h-10 shrink-0 rounded-xl bg-white/5 border border-white/10 text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 active:scale-95 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="flex-1 h-10 rounded-xl bg-[#12c83b] text-black text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </>
        ) : (
          <button
            onClick={startEditing}
            className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Pencil size={13} /> Изменить курс
          </button>
        )}
      </div>
    </div>
  );
}

// Экран региона: конвертер валюты региона в ₽ (курс ступенями) и разделы подписок
function RegionView({
  platform,
  platformLabel,
  region,
  standardPrices,
  apiUrl,
  onSaved,
  onBack,
}: {
  platform: Platform;
  platformLabel: string;
  region: Region;
  standardPrices: Record<string, Record<string, number>>;
  apiUrl: string;
  onSaved?: () => void;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(false);

  const sectionKey = (id: string) => `${platform}|${region.id}|${id}`;
  const serverRates = standardPrices[sectionKey("rate")] ?? DEFAULT_RATE_PRICES;
  const [ratePrices, setRatePrices] = useState(serverRates);
  useEffect(() => setRatePrices(serverRates), [serverRates]);

  const tiers = parseRateTiers(ratePrices);
  const value = Number(amount.replace(",", ".")) || 0;
  const mult = multiplierFor(tiers, value);
  const rub = Math.round(value * mult);


  return (
    <div className="animate-[fadeInUp_0.25s_ease-out_both]">
      <div className="flex items-center gap-3 mb-5">
        <motion.button
          onTap={onBack}
          whileTap={{ scale: 0.9 }}
          style={{ WebkitTapHighlightColor: "transparent" }}
          aria-label="Назад"
          className="cursor-pointer touch-manipulation select-none w-10 h-10 shrink-0 rounded-full bg-neutral-800/50 border border-white/10 flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-white" />
        </motion.button>
        <div className="flex items-center gap-1.5 text-[15px] min-w-0">
          <span className="text-neutral-500 truncate">{platformLabel}</span>
          <ChevronRight size={14} className="text-neutral-600 shrink-0" />
          <span className="text-white font-medium truncate">{region.label}</span>
        </div>
      </div>

      <div className="p-2.5 mb-4 rounded-2xl border border-white/5 bg-neutral-800/40">
      <div className="flex items-center gap-3 pr-2.5">
        <motion.button
          onTap={() => setShowRates((v) => !v)}
          whileTap={{ scale: 0.9 }}
          style={{ WebkitTapHighlightColor: "transparent" }}
          aria-label="Курс"
          className={`cursor-pointer touch-manipulation select-none w-11 h-11 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
            showRates ? "bg-white/10 border-white/20" : "bg-neutral-800 border-transparent"
          }`}
        >
          <region.Flag />
        </motion.button>
        <label className="flex-1 min-w-0 h-11 flex items-center gap-2 px-4 rounded-full bg-neutral-800/70">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-[16px] placeholder:text-neutral-500"
          />
          <span className="text-[13px] font-medium text-neutral-500 shrink-0">{region.currency}</span>
        </label>
        <span
          className="text-[20px] font-bold text-green-500 shrink-0 tabular-nums"
          title={mult ? `Курс: ×${formatMult(mult)}` : "Курс не задан — нажмите на флаг"}
        >
          {tiers.length ? `${rubFormat.format(rub)}₽` : "—"}
        </span>
      </div>
      {showRates && (
        <RateTable
          sectionKey={sectionKey("rate")}
          label={`Курс · ${platformLabel} · ${region.label}`}
          currency={region.currency}
          prices={ratePrices}
          apiUrl={apiUrl}
          onSavedPrices={setRatePrices}
          onSaved={onSaved}
        />
      )}
      </div>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => {
          const open = openSection === section.id;
          return (
            <div key={section.id} className="rounded-2xl border border-white/5 bg-neutral-800/40 overflow-hidden">
              <motion.button
                onTap={() => setOpenSection(open ? null : section.id)}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className="cursor-pointer touch-manipulation select-none w-full h-[76px] flex items-center gap-3 px-5"
              >
                <span className="text-[24px] leading-none">{section.icon}</span>
                <span className="flex-1 text-left text-[16px] font-semibold text-white">{section.label}</span>
                <ChevronDown
                  size={18}
                  className={`text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
              </motion.button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {section.id === "psplus" ? (
                      <PsPlusTable
                        sectionKey={sectionKey(section.id)}
                        label={`${section.label} · ${platformLabel} · ${region.label}`}
                        regionLabel={region.label}
                        Flag={region.Flag}
                        prices={standardPrices[sectionKey(section.id)] ?? {}}
                        apiUrl={apiUrl}
                        onSaved={onSaved}
                      />
                    ) : (
                      <div className="px-5 pb-5 text-[13px] text-neutral-500">Цены пока не добавлены</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StandardPrices({
  standardPrices = {},
  apiUrl,
  onSaved,
}: {
  standardPrices?: Record<string, Record<string, number>>;
  apiUrl: string;
  onSaved?: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>("playstation");
  const [regionId, setRegionId] = useState<string | null>(null);

  const platformInfo = PLATFORMS.find((p) => p.id === platform)!;
  const region = REGIONS[platform].find((r) => r.id === regionId);

  if (region) {
    return (
      <div className="px-6 pb-10">
        <RegionView
          key={`${platform}-${region.id}`}
          platform={platform}
          platformLabel={platformInfo.label}
          region={region}
          standardPrices={standardPrices}
          apiUrl={apiUrl}
          onSaved={onSaved}
          onBack={() => setRegionId(null)}
        />
      </div>
    );
  }

  return (
    <div className="px-6 pb-10">
      <div className="flex gap-2.5 mb-5">
        {PLATFORMS.map(({ id, label, Icon }) => {
          const active = platform === id;
          return (
            <motion.button
              key={id}
              onTap={() => setPlatform(id)}
              whileTap={{ scale: 0.95 }}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none flex items-center gap-2 h-10 px-4 rounded-full border text-[14px] font-semibold transition-colors ${
                active
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "bg-neutral-800/50 border-white/10 text-white/80"
              }`}
            >
              <Icon size={16} />
              {label}
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        {REGIONS[platform].map(({ id, label, Flag }, index) => (
          <motion.button
            key={`${platform}-${id}`}
            onTap={() => platform === "playstation" && setRegionId(id)}
            whileTap={{ scale: 0.97 }}
            style={{
              animationDelay: `${index * 40}ms`,
              WebkitTapHighlightColor: "transparent",
            }}
            className="cursor-pointer touch-manipulation select-none h-[150px] w-full flex items-center justify-center gap-3 rounded-2xl border border-white/5 bg-neutral-800/40 animate-[fadeInUp_0.3s_ease-out_both]"
          >
            <Flag />
            <span className="text-[16px] font-semibold text-white">{label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
