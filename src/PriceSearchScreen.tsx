import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, X, Check, Pencil } from "lucide-react";
import { API_URL, apiFetch } from "./config";
import { PS_RATE_REGIONS, RateConverter } from "./components/StandardPrices";
import { USDT_KEY, USDT_PRICE_KEY } from "./components/UsdtRate";

type PsSuggestion = { name: string; kind: string; platforms: string[]; cover: string };
type RegionPrice = { code: string; country: string; price: string; basePrice: string | null; rub: number | null };
// label — подпись издания от сервера: «Стандартное», «Deluxe Edition», «Ultimate Edition PS4 & PS5»
type Edition = { id: string; name: string; label: string; kind: string; cover: string; prices: RegionPrice[] };

// Обложки магазина PlayStation можно запрашивать нужного размера
const psThumb = (url: string, size: number) => `${url}?w=${size}`;

type RegionRow = {
  code: string;
  country: string;
  editions: { id: string; label: string; price: string; basePrice: string | null; rub: number | null }[];
};

// Подпись издания без платформ: «Ultimate Edition PS4 & PS5» → «Ultimate Edition»
function withoutPlatforms(label: string) {
  const clean = label.replace(/\bPS[45]\b/gi, "").replace(/&/g, "").replace(/\s+/g, " ").trim();
  return clean || "Стандартное";
}

// Регионы с изданиями внутри; порядок — по цене первого (стандартного) издания в рублях
function groupByRegion(editions: Edition[]): RegionRow[] {
  const regions = new Map<string, RegionRow>();
  for (const edition of editions) {
    for (const p of edition.prices) {
      if (!regions.has(p.code)) regions.set(p.code, { code: p.code, country: p.country, editions: [] });
      regions.get(p.code)!.editions.push({
        id: edition.id,
        label: withoutPlatforms(edition.label),
        price: p.price,
        basePrice: p.basePrice,
        rub: p.rub,
      });
    }
  }
  const firstRub = (r: RegionRow) => r.editions[0]?.rub ?? Infinity;
  return Array.from(regions.values()).sort((a, b) => firstRub(a) - firstRub(b));
}

// Недавно проверенные игры — на этом устройстве, до 10 штук, новые сверху
const RECENT_KEY = "price_search_recent";
const RECENT_LIMIT = 10;

function loadRecent(): PsSuggestion[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRecent(list: PsSuggestion[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Хранилище браузера недоступно — список просто не запомнится
  }
}


// Конвертер под игрой — только для Украины
const CONVERTER_REGIONS = PS_RATE_REGIONS.filter((r) => r.id === "ua");

// Сумма из цены магазина для конвертера: «UAH 2 199,00» → «2199», «3.449,00 TL» → «3449»
function amountFromPrice(price: string) {
  const cleaned = price.replace(/[^\d.,]/g, "");
  const match = cleaned.match(/^(.*)[.,](\d{2})$/);
  const whole = (match ? match[1] : cleaned).replace(/[.,]/g, "");
  const cents = match && match[2] !== "00" ? `,${match[2]}` : "";
  return whole ? `${Number(whole)}${cents}` : "";
}

async function post(body: object) {
  const response = await apiFetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  return response.json();
}

// Раздел «Цены»: поиск игры в PlayStation Store и сравнение её цены по регионам
export default function PriceSearchScreen({
  standardPrices = {},
  onRatesSaved,
}: {
  // Курсы ступенями из вкладки «Стандарт» — для конвертеров под игрой
  standardPrices?: Record<string, Record<string, number>>;
  onRatesSaved?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PsSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [game, setGame] = useState<PsSuggestion | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [error, setError] = useState("");
  const searchRequestRef = useRef(0);
  const [recent, setRecent] = useState<PsSuggestion[]>(loadRecent);
  const serverUsdt = standardPrices[USDT_KEY]?.[USDT_PRICE_KEY] ?? null;
  const [usdt, setUsdt] = useState<number | null>(serverUsdt);
  useEffect(() => setUsdt(serverUsdt), [serverUsdt]);
  const [isEditingUsdt, setIsEditingUsdt] = useState(false);
  const [usdtDraft, setUsdtDraft] = useState("");
  const [isSavingUsdt, setIsSavingUsdt] = useState(false);

  const saveUsdt = async () => {
    const value = Number(usdtDraft.replace(",", "."));
    if (!(value > 0) || isSavingUsdt) return;
    setIsSavingUsdt(true);
    try {
      const result = await post({
        action: "updateStandardPrices",
        key: USDT_KEY,
        label: "Курс USDT",
        prices: { [USDT_PRICE_KEY]: value },
      });
      if (!result.success) throw new Error(result.error);
      setUsdt(value);
      setIsEditingUsdt(false);
      onRatesSaved?.();
    } catch {
      // Не сохранилось — поле остаётся открытым
    } finally {
      setIsSavingUsdt(false);
    }
  };

  // Суммы в конвертерах по регионам (ua, tr); нажатие на цену издания подставляет её сюда
  const [converterAmounts, setConverterAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !showSuggestions) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    const request = ++searchRequestRef.current;
    setIsSearching(true);
    // Ищем, когда перестали печатать
    const timer = setTimeout(async () => {
      try {
        const result = await post({ action: "psSearch", query: q });
        if (request === searchRequestRef.current) setSuggestions(result.success ? result.results : []);
      } catch {
        if (request === searchRequestRef.current) setSuggestions([]);
      } finally {
        if (request === searchRequestRef.current) setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, showSuggestions]);

  const pickGame = async (s: PsSuggestion) => {
    setRecent((list) => {
      const next = [s, ...list.filter((g) => g.name !== s.name)].slice(0, RECENT_LIMIT);
      saveRecent(next);
      return next;
    });
    setGame(s);
    setQuery(s.name);
    setShowSuggestions(false);
    setEditions([]);
    setError("");
    setIsLoadingPrices(true);
    try {
      const result = await post({ action: "psRegionPrices", name: s.name });
      if (!result.success) throw new Error(result.error || "Не удалось получить цены");
      setEditions(result.editions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoadingPrices(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] px-5 pb-40"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 1.25rem)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Цены</h1>
        {isEditingUsdt ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-neutral-400">USDT</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={usdtDraft}
              onChange={(e) => setUsdtDraft(e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveUsdt();
              }}
              placeholder="0"
              className="w-20 h-9 bg-[#121212] border border-green-500/40 rounded-lg px-2 text-[15px] text-white text-right outline-none"
            />
            <button
              onClick={saveUsdt}
              disabled={isSavingUsdt}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#12c83b] text-black active:scale-90 transition-all disabled:opacity-50"
            >
              {isSavingUsdt ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setUsdtDraft(usdt ? String(usdt).replace(".", ",") : "");
              setIsEditingUsdt(true);
            }}
            className="h-9 px-3.5 flex items-center gap-2 rounded-full bg-white/[0.05] border border-white/10 active:scale-95 transition-all"
          >
            <span className="text-[13px] font-semibold text-neutral-400">USDT</span>
            <span className="text-[15px] font-bold text-white tabular-nums">
              {usdt ? `${usdt.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽` : "—"}
            </span>
            <Pencil size={13} className="text-neutral-500" />
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
          placeholder="Название игры"
          className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-2xl pl-11 pr-11 text-[15px] text-white outline-none focus:border-[#12c83b]/50 placeholder:text-neutral-600"
        />
        {query && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery("");
              setSuggestions([]);
              setGame(null);
              setEditions([]);
              setError("");
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-neutral-500"
          >
            <X size={16} />
          </button>
        )}

        <AnimatePresence>
          {showSuggestions && query.trim().length >= 2 && (isSearching || suggestions.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute z-50 top-full left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-1.5"
              style={{ scrollbarWidth: "none" }}
            >
              {isSearching && suggestions.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-neutral-500" />
                </div>
              ) : (
                suggestions.map((s, index) => (
                  <div
                    key={`${s.name}-${index}`}
                    // onMouseDown — срабатывает раньше, чем поле потеряет фокус
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickGame(s);
                    }}
                    className="px-2 py-2 flex items-center gap-3 rounded-xl cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <img
                      src={psThumb(s.cover, 120)}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded-lg object-cover shrink-0 bg-white/5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-white truncate">{s.name}</div>
                      <div className="text-[12px] text-neutral-500 truncate">
                        {[s.kind, s.platforms.join(" / ")].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!game && recent.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">Недавние</span>
            <button
              onClick={() => {
                setRecent([]);
                saveRecent([]);
              }}
              className="text-[12px] text-neutral-500 active:text-neutral-300"
            >
              Очистить
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((g) => (
              <motion.button
                key={g.name}
                whileTap={{ scale: 0.98 }}
                onClick={() => pickGame(g)}
                style={{ WebkitTapHighlightColor: "transparent" }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-left"
              >
                <img
                  src={psThumb(g.cover, 120)}
                  alt=""
                  loading="lazy"
                  className="w-11 h-11 rounded-lg object-cover shrink-0 bg-white/5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-white truncate">{g.name}</div>
                  <div className="text-[12px] text-neutral-500 truncate">
                    {[g.kind, g.platforms.join(" / ")].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {game && (
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <img src={psThumb(game.cover, 200)} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 bg-white/5" />
            <div className="min-w-0">
              <div className="text-[17px] font-bold text-white leading-tight">{game.name}</div>
              <div className="text-[12px] text-neutral-500">
                {[game.kind, game.platforms.join(" / ")].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-2">
            {CONVERTER_REGIONS.map((region) => (
              <RateConverter
                key={region.id}
                // Свой курс для игр — отдельно от курса подписок во вкладке «Стандарт»
                rateKey={`games|${region.id}|rate`}
                rateLabel={`Курс игр · ${region.label}`}
                // ₽ = гривны ÷ значение ступени × курс USDT
                viaUsdt
                usdtRate={usdt}
                region={region}
                standardPrices={standardPrices}
                apiUrl={API_URL}
                onSaved={onRatesSaved}
                amount={converterAmounts[region.id] ?? ""}
                onAmountChange={(value) => setConverterAmounts((prev) => ({ ...prev, [region.id]: value }))}
              />
            ))}
          </div>

          {isLoadingPrices ? (
            <div className="flex flex-col items-center gap-3 py-10 text-neutral-500">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-[13px]">Ищем цены по регионам…</span>
            </div>
          ) : error ? (
            <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">{error}</div>
          ) : editions.length === 0 ? (
            <div className="py-10 text-center text-[14px] text-neutral-500">Цены не найдены</div>
          ) : (
            <>
              <div className="mb-2 pl-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                От дешёвых к дорогим · в рублях по курсу ЦБ
              </div>
              <div className="flex flex-col gap-2">
                {(() => {
                  const regions = groupByRegion(editions);
                  const cheapest = regions[0]?.editions[0]?.rub ?? null;
                  return regions.map((region) => {
                    const isCheapest = cheapest !== null && region.editions[0]?.rub === cheapest;
                    return (
                      <div
                        key={region.code}
                        className={`px-4 py-3 rounded-2xl border ${
                          isCheapest ? "bg-[#12c83b]/10 border-[#12c83b]/30" : "bg-white/[0.03] border-white/5"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold text-white">
                          {/* Картинка, а не эмодзи: эмодзи-флаги на Windows показываются буквами */}
                          <img
                            src={`https://flagcdn.com/w40/${region.code}.png`}
                            alt=""
                            className="w-5 h-[15px] rounded-[3px] object-cover shrink-0"
                          />
                          {region.country}
                        </div>
                        <div className="flex flex-col gap-1">
                          {region.editions.map((e) => (
                            <div key={e.id} className="flex items-center justify-between gap-3">
                              <div className="min-w-0 text-[13px]">
                                <span className="text-neutral-300">{e.label}</span>
                                {CONVERTER_REGIONS.some((r) => r.id === region.code) ? (
                                  <button
                                    onClick={() =>
                                      setConverterAmounts((prev) => ({ ...prev, [region.code]: amountFromPrice(e.price) }))
                                    }
                                    title="Подставить в конвертер"
                                    className="ml-2 text-neutral-400 underline decoration-dotted underline-offset-4 active:text-white"
                                  >
                                    {e.price}
                                  </button>
                                ) : (
                                  <span className="ml-2 text-neutral-500">{e.price}</span>
                                )}
                                {e.basePrice && <span className="ml-1.5 text-neutral-500 line-through">{e.basePrice}</span>}
                              </div>
                              <div
                                className={`text-[14px] font-bold shrink-0 ${
                                  isCheapest && e.id === region.editions[0].id ? "text-[#12c83b]" : "text-white"
                                }`}
                              >
                                {e.rub !== null ? `≈ ${e.rub.toLocaleString("ru-RU")} ₽` : "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
