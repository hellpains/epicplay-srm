import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Copy, Check, Search } from "lucide-react";
import { apiFetch } from "../config";
import { USDT_KEY, USDT_PRICE_KEY } from "./UsdtRate";

type OrderStatus = "success" | "rejected" | "pending";

type Order = {
  id: string;
  label: string;
  email: string;
  code: string;
  status: OrderStatus;
  // Почему заказ отклонён; у остальных статусов пусто
  reason?: string;
  // Удалось ли ZovoCard отключить автопродление у клиента; пусто — неизвестно
  renewalStatus?: string;
  // Сколько потрачено на заказ в долларах (подписка и сбор); известно только для недавних успешных
  spentUsd?: number | null;
  // Логин того, кто оформил заказ; у заказов с сайта ZovoCard его нет
  actor?: string;
  createdAt: string;
};

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  success: { label: "Успешно", className: "bg-[#12c83b]/15 border-[#12c83b]/30 text-[#12c83b]" },
  rejected: { label: "Отклонено", className: "bg-red-500/15 border-red-500/30 text-red-400" },
  pending: { label: "Оформляется", className: "bg-amber-500/15 border-amber-500/30 text-amber-400" },
};

// С такими статусами автопродление осталось включённым — его нужно отключить руками в ChatGPT
const RENEWAL_MANUAL = new Set(["warning", "manual_required"]);

// Цвет логина в истории — чтобы сразу видеть, кто оформил заказ; остальные логины серые
const ACTOR_COLORS: Record<string, string> = {
  hellpains: "text-blue-400",
  suleyman: "text-yellow-400",
};

const historyDate =new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// plan — название тарифа у ZovoCard: по нему приходят цены
export const PRODUCTS = [
  { key: "Go|1", tab: "Go", label: "ChatGPT Go", plan: "go" },
  { key: "Plus|1", tab: "Plus", label: "ChatGPT Plus", plan: "plus" },
  { key: "Pro|5", tab: "Pro 5x", label: "ChatGPT Pro 5x", plan: "pro_5x" },
  { key: "Pro|20", tab: "Pro 20x", label: "ChatGPT Pro 20x", plan: "pro_20x" },
  { key: "Pro|50", tab: "Pro 50x", label: "ChatGPT Pro 50x", plan: "pro_50x" },
];

const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

// Токен — JSON сессии ChatGPT целиком: внутри accessToken (JWT), пользователь и аккаунт с тарифом
export function parseSessionToken(text: string): { email: string; planType: string } | null {
  try {
    const data = JSON.parse(text);
    const valid =
      typeof data?.accessToken === "string" &&
      JWT.test(data.accessToken) &&
      typeof data?.user?.id === "string" &&
      typeof data?.account?.planType === "string";
    if (!valid) return null;
    return { email: typeof data.user.email === "string" ? data.user.email : "", planType: data.account.planType };
  } catch {
    return null;
  }
}

// День по местному времени: "2026-10-04"
function localDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Сколько заказов показываем сразу и добавляем кнопкой «Показать ещё»
const HISTORY_PAGE = 50;
// Сколько кнопок-дней показываем самое большее
const DAYS_MAX = 366;

const POLL_MS = 10_000;
// Дольше суток результат не ждём: такой заказ остаётся «оформляется», пока его не проверят вручную
const POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Через портал: у родителя есть transform, внутри него fixed считался бы от него, а не от экрана
function Modal({
  open,
  title,
  Icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  Icon: typeof Sparkles;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[30px] p-6 shadow-2xl flex flex-col"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5 pr-8">
              <div className="w-10 h-10 rounded-full bg-[#12c83b]/15 flex items-center justify-center shrink-0 border border-[#12c83b]/30">
                <Icon size={20} className="text-[#12c83b]" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight leading-none">{title}</h3>
            </div>

            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

const primaryButton =
  "mt-4 w-full h-12 rounded-[18px] bg-[#12c83b] text-black text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40";

// Вкладка «CDK»: подписка ChatGPT клиенту по его токену. Код CDK сервер берёт сам — неиспользованный
// с аккаунта ZovoCard или покупает новый — и сразу активирует
export default function CdkTokens({
  standardPrices = {},
  apiUrl,
}: {
  standardPrices?: Record<string, Record<string, number>>;
  apiUrl: string;
}) {
  // -1 — тариф ещё не выбран: по умолчанию не выбираем, чтобы не оформить не тот по невнимательности
  const [productIndex, setProductIndex] = useState(-1);
  const [tokens, setTokens] = useState<Record<string, string>>({});

  // Курс USDT из шапки (рублей за доллар) — по нему цены тарифов пересчитываются в рубли
  const usdtRate = Number(standardPrices[USDT_KEY]?.[USDT_PRICE_KEY]) || 0;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Код, ушедший на оформление, показываем в окне
  const [usedCode, setUsedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState("");
  // Почему сервер не получил данные от ZovoCard (баланс, карты, цены); пусто — всё в порядке
  const [zovoIssue, setZovoIssue] = useState("");
  // Доступный баланс ZovoCard; приходит вместе с историей и обновляется с ней же
  const [balance, setBalance] = useState<{ amount: number; currency: string } | null>(null);
  // Активные карты ZovoCard, старые слева: последние четыре цифры и остаток на карте.
  // exhausted — лимит оформлений исчерпан, карту можно удалять; payments — сколько оформлений прошло с карты
  const [cards, setCards] = useState<
    { last4: string; balance: number; exhausted?: boolean; payments?: number | null; minRecharge?: number | null }[]
  >([]);
  // Цены подписок у ZovoCard по тарифам (ключ — plan); ориентир, точную сумму сервис назовёт при проверке
  const [prices, setPrices] = useState<
    Record<string, { amount: number; currency: string; amountUsd: number | null; feeUsd: number; available: boolean }>
  >({});
  // Более старые заказы, подгруженные кнопкой «Показать ещё»; orders — первая страница, она обновляется сама
  const [olderOrders, setOlderOrders] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Фильтры истории работают в браузере по уже загруженным заказам — переключаются сразу.
  // Выбранный день ("2026-10-04"); пусто — вся история
  const [day, setDay] = useState("");
  // Выбранный человек (логин); пусто — все заказы
  const [actor, setActor] = useState("");
  // Поиск по истории: почта или код
  const [search, setSearch] = useState("");
  // Сколько заказов показано; остальные открывает «Показать ещё»
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE);

  const api = async (body: Record<string, unknown>) => {
    const response = await apiFetch(apiUrl, { method: "POST", body: JSON.stringify(body) });
    return await response.json();
  };

  // Актуальный список старых заказов для loadOrders: её вызывает таймер со старым замыканием
  const olderOrdersRef = useRef<Order[]>([]);
  olderOrdersRef.current = olderOrders;

  const loadOrders = async () => {
    try {
      const result = await api({ action: "cdkOrders", op: "list" });
      if (result.success) {
        setZovoIssue(result.zovoIssue ?? "");
        setBalance(result.balance ?? null);
        // Красные (исчерпанные) карты — первыми, за ними активные; внутри каждой группы порядок прежний
        const allCards: typeof cards = result.cards ?? [];
        setCards([...allCards.filter((c) => c.exhausted), ...allCards.filter((c) => !c.exhausted)]);
        setPrices(result.prices ?? {});
        setOrders(result.orders);
        // Пока старые страницы не открывали, «есть ли ещё» знает первая страница
        if (olderOrdersRef.current.length === 0) setHasMore(Boolean(result.hasMore));
        setOrdersError("");
      } else {
        setOrdersError(result.error || "Не удалось загрузить историю");
      }
    } catch (e) {
      setOrdersError("Ошибка сети");
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // При смене фильтра список снова показываем с начала
  useEffect(() => {
    setVisibleCount(HISTORY_PAGE);
  }, [day, actor, search]);

  // Все загруженные заказы: первая страница и подгруженные старые, без повторов, новые сверху
  const firstPageIds = new Set((orders ?? []).map((o) => o.id));
  const history = [...(orders ?? []), ...olderOrders.filter((o) => !firstPageIds.has(o.id))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Заказы с днём (по местному времени) и тем, кто оформил; у заказов с сайта ZovoCard человека нет
  // Поиск — по почте и коду, без учёта регистра; счётчики на кнопках считаются уже по найденному
  const needle = search.trim().toLowerCase();
  const dated = history
    .filter((order) => !needle || order.email.toLowerCase().includes(needle) || order.code.toLowerCase().includes(needle))
    .map((order) => ({ order, date: localDay(new Date(order.createdAt)), by: order.actor ?? "" }));
  const ofDay = dated.filter((x) => !day || x.date === day);
  // То, что показываем: выбранный день и выбранный человек
  const shown = ofDay.filter((x) => !actor || x.by === actor).map((x) => x.order);

  // Люди — все, кто когда-либо оформлял, по числу заказов за всё время: список и порядок не зависят
  // от выбранного дня. Счётчик — за выбранный день
  const actorTotals = new Map<string, number>();
  for (const order of history) {
    if (order.actor) actorTotals.set(order.actor, (actorTotals.get(order.actor) ?? 0) + 1);
  }
  const actors = [...actorTotals]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => ({ name, count: ofDay.filter((x) => x.by === name).length }));
  const total = ofDay.length;

  // Дни подряд от сегодняшнего до дня самого старого заказа, новые слева. Счётчик — для выбранного человека
  const dayCounts = new Map<string, number>();
  for (const x of dated) if (!actor || x.by === actor) dayCounts.set(x.date, (dayCounts.get(x.date) ?? 0) + 1);
  const days: { date: string; count: number }[] = [];
  if (history.length > 0) {
    // Ряд дней — по всей истории, а не по найденному: при поиске он не должен укорачиваться
    const oldestDay = localDay(new Date(history[history.length - 1].createdAt));
    const cursor = new Date();
    for (let i = 0; i < DAYS_MAX && localDay(cursor) >= oldestDay; i++) {
      const date = localDay(cursor);
      days.push({ date, count: dayCounts.get(date) ?? 0 });
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const loadMore = async () => {
    // Заказы с сайта ZovoCard (id "zovo-…") в нашей таблице не лежат — границу страницы по ним не считаем
    const own = history.filter((o) => !o.id.startsWith("zovo-"));
    if (isLoadingMore || own.length === 0) return;
    setIsLoadingMore(true);
    try {
      const result = await api({ action: "cdkOrders", op: "list", before: own[own.length - 1].createdAt });
      if (result.success) {
        // Запоминаем и текущую первую страницу: новые заказы со временем вытеснят её строки
        setOlderOrders((prev) => {
          const known = new Set(prev.map((o) => o.id));
          return [...prev, ...[...own, ...result.orders].filter((o: Order) => !known.has(o.id) && known.add(o.id))];
        });
        setHasMore(Boolean(result.hasMore));
      } else {
        setOrdersError(result.error || "Не удалось загрузить историю");
      }
    } catch (e) {
      setOrdersError("Ошибка сети");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // «Показать ещё»: сначала открываем уже загруженные заказы, а когда они кончились — просим у сервера старые
  const showMore = () => {
    if (shown.length <= visibleCount && hasMore) loadMore();
    setVisibleCount((count) => count + HISTORY_PAGE);
  };

  // Пока есть заказы «оформляется», раз в 10 секунд обновляем историю: статусы сервер сверяет с ZovoCard.
  // loadOrders кладёт новый список — эффект запускается снова, и так до окончательных статусов
  useEffect(() => {
    const hasPending = (orders ?? []).some(
      (o) => o.status === "pending" && Date.now() - new Date(o.createdAt).getTime() < POLL_MAX_AGE_MS
    );
    if (!hasPending) return;
    const timer = setTimeout(loadOrders, POLL_MS);
    return () => clearTimeout(timer);
  }, [orders]);

  // Вкладки переключателя людей: «Все» и каждый, кто оформлял. Выбранный остаётся, даже если у него стало 0
  const actorTabs = [
    { name: "", count: total },
    ...actors,
    ...(actor && !actors.some((a) => a.name === actor) ? [{ name: actor, count: 0 }] : []),
  ];

  const hasProduct = productIndex >= 0;

  // Токен, вставленный до выбора тарифа (лежит под пустым ключом), переходит на выбранный тариф
  const selectProduct = (index: number) => {
    const nextKey = PRODUCTS[index].key;
    setTokens((prev) => (prev[""] ? { ...prev, [nextKey]: prev[nextKey] || prev[""], "": "" } : prev));
    setProductIndex(index);
  };

  const { key, label, plan } = PRODUCTS[productIndex] ?? { key: "", label: "", plan: "" };
  const token = tokens[key] ?? "";
  const session = parseSessionToken(token);
  const price = prices[plan];
  // Текущий тариф клиента записан в его токене. Если он не бесплатный, ZovoCard, скорее всего, откажет —
  // но уже после того, как сервер возьмёт код, поэтому предупреждаем заранее
  const activePlan = session && session.planType !== "free" ? session.planType : "";
  // Хватит ли баланса. Подписку оплачивает карта: если на ней меньше цены, её пополняют с баланса на
  // недостающее, но не меньше её минимального пополнения. Сбор за код идёт с баланса отдельно.
  // Из рабочих карт берём ту, которой нужно меньше всего; карт нет — нужна вся цена.
  // Неизвестно (нет баланса или цены) — считаем, что хватит: окончательно решит ZovoCard
  const shortage = (() => {
    if (!balance || price?.amountUsd == null) return null;
    const subscription = price.amountUsd;
    const best = cards
      .filter((card) => !card.exhausted)
      .map((card) => ({
        card,
        topUp: card.balance >= subscription ? 0 : Math.max(subscription - card.balance, card.minRecharge ?? 0),
      }))
      .sort((a, b) => a.topUp - b.topUp)[0];
    const topUp = best ? best.topUp : subscription;
    const need = topUp + price.feeUsd;
    return balance.amount < need ? { need, topUp, card: best?.card } : null;
  })();
  const usd = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} $`;

  // Всё оформление делает сервер: проверяет токен, берёт или покупает код, активирует его
  const confirmOrder = async () => {
    if (isBusy || !session || shortage) return;
    setIsBusy(true);
    setError("");
    try {
      const result = await api({
        action: "cdkOrders",
        op: "redeem",
        product: key,
        email: session.email,
        session: token.trim(),
      });
      if (result.success) {
        setUsedCode(result.order.code);
      } else {
        setError(result.error || "Не удалось оформить");
      }
      // История и баланс могли измениться даже при отказе: код мог быть куплен
      loadOrders();
    } catch (e) {
      // Ответ не дошёл, но заказ мог уйти — покажет история
      setError("Связь оборвалась. Проверьте историю: заказ мог быть отправлен");
      loadOrders();
    } finally {
      setIsBusy(false);
    }
  };

  const openConfirm = () => {
    setUsedCode("");
    setCopied(false);
    setError("");
    setIsConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (isBusy) return;
    // Заказ отправлен — токен этого клиента больше не нужен
    if (usedCode) setTokens((prev) => ({ ...prev, [key]: "" }));
    setIsConfirmOpen(false);
  };

  // С трёх карт баланс и карты не помещаются в одну строку — карты уходят под баланс
  const cardsBelow = cards.length >= 3;

  // Карта: последние четыре цифры и остаток, ниже одной строкой — число оплат и минимальное пополнение
  const cardBody = (card: (typeof cards)[number]) => (
    <>
      {card.last4}:{" "}
      <span className={`font-semibold tabular-nums ${card.exhausted ? "" : "text-white"}`}>
        {card.balance.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} {balance?.currency || "USD"}
      </span>
      {(card.payments != null || card.minRecharge != null) && (
        <div className="text-[12px] tabular-nums whitespace-nowrap">
          {card.payments != null && `Опл: ${card.payments}`}
          {card.payments != null && card.minRecharge != null && " · "}
          {card.minRecharge != null &&
            `От ${card.minRecharge.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}$`}
        </div>
      )}
    </>
  );

  // Копирование почты и кода из истории нажатием; copiedField — что скопировано только что ("id заказа:поле"):
  // оно на секунду зеленеет
  const [copiedField, setCopiedField] = useState("");
  // Заказы, у которых код раскрыт целиком (по нему нажали)
  const [openCodes, setOpenCodes] = useState<Set<string>>(new Set());
  const copyField = (field: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField((current) => (current === field ? "" : current)), 1000);
  };

  const copyUsedCode = () => {
    navigator.clipboard.writeText(usedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="px-6 pb-10">
      <div className="flex bg-neutral-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 relative">
        <div
          className={`absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/5)] bg-neutral-700 rounded-xl transition-transform duration-200 ease-out ${
            hasProduct ? "" : "hidden"
          }`}
          style={{ transform: `translateX(${productIndex * 100}%)` }}
        />
        {PRODUCTS.map((product, index) => (
          <motion.button
            key={product.key}
            onTap={() => selectProduct(index)}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 min-w-0 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
              productIndex === index ? "text-white" : "text-neutral-500"
            }`}
          >
            {product.tab}
          </motion.button>
        ))}
      </div>

      {/* Цены ZovoCard под каждым тарифом: подписка вместе с сервисным сбором, в долларах и ниже в рублях
          по курсу USDT из шапки. Колонки — как у кнопок выше */}
      <div className="flex px-1.5 mt-1.5 mb-4 min-h-[8px]">
        {PRODUCTS.map((product, index) => {
          const price = prices[product.plan];
          if (!price) return <div key={product.key} className="flex-1" />;
          return (
            <div
              key={product.key}
              className={`flex-1 min-w-0 text-center text-[12px] font-semibold whitespace-nowrap tabular-nums ${price.available ? "" : "line-through"} ${
                productIndex === index ? "text-white" : "text-neutral-500"
              }`}
            >
              {/* Курс к доллару не узнали — показываем цену в валюте ZovoCard, без сбора: он в долларах */}
              {price.amountUsd === null
                ? `${price.amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${price.currency}`
                : `$${(price.amountUsd + price.feeUsd).toFixed(2)}`}
              {price.amountUsd !== null && usdtRate > 0 && (
                <div className="text-[11px] font-medium">
                  {Math.round((price.amountUsd + price.feeUsd) * usdtRate).toLocaleString("ru-RU")} ₽
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <input
          value={token}
          placeholder={'{"user":{…},"account":{…},"accessToken":"eyJ…"}'}
          onChange={(e) => setTokens((prev) => ({ ...prev, [key]: e.target.value }))}
          className={`w-full h-12 bg-white/[0.04] border rounded-[14px] px-4 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
            session ? "border-[#12c83b]" : "border-white/10 focus:border-white/30"
          }`}
        />
      </div>

      <button onClick={openConfirm} disabled={!hasProduct || !session} className={primaryButton}>
        {hasProduct ? "Оформить" : "Выберите тариф"}
      </button>
      {/* Общий баланс ZovoCard (без подписи, крупнее и с линией снизу) и карты: последние четыре цифры
          и остаток. До двух карт — одной строкой слева, карты за чертой. С трёх карт в строку не помещается:
          баланс по центру, под ним линия на всю ширину, карты ниже */}
      {zovoIssue && (
        <div className="mt-3 px-1 text-[13px] text-amber-400">
          Данные ZovoCard получены не полностью: {zovoIssue}
        </div>
      )}
      {(balance || cards.length > 0) && (
        <div
          className="mt-3 px-1 flex flex-wrap items-start gap-x-3 gap-y-1 text-[13px] text-neutral-500"
        >
          {balance && (
            <div
              className={`border-b border-white/15 text-[16px] leading-5 font-bold tabular-nums text-white ${
                cardsBelow ? "w-full pb-2 mb-1.5 text-center" : "pb-1"
              }`}
            >
              {balance.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} {balance.currency}
            </div>
          )}
          {cardsBelow ? (
            // Карты сеткой по три в ряд; между рядами — пунктирная линия на всю ширину
            // (пустые ячейки добивают последний ряд, чтобы линия не обрывалась)
            <div className="w-full grid grid-cols-3">
              {[...cards, ...Array<null>((3 - (cards.length % 3)) % 3).fill(null)].map((card, index) => (
                <div
                  key={card?.last4 ?? `empty-${index}`}
                  className={`relative px-2 ${index >= 3 ? "mt-2 pt-2 border-t border-dashed border-white/15" : ""} ${
                    card?.exhausted ? "text-red-400/70" : ""
                  }`}
                >
                  {card && index % 3 !== 0 && (
                    <div className={`absolute left-0 h-4 w-px bg-white/15 ${index >= 3 ? "top-2.5" : "top-0.5"}`} />
                  )}
                  {card && cardBody(card)}
                </div>
              ))}
            </div>
          ) : (
            cards.map((card, index) => (
              <Fragment key={card.last4}>
                {(balance || index > 0) && <div className="mt-0.5 h-4 w-px bg-white/15" />}
                <div className={card.exhausted ? "text-red-400/70" : ""}>{cardBody(card)}</div>
              </Fragment>
            ))
          )}
        </div>
      )}

      <div className="mt-8 mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-neutral-500">История CDK</div>
      {history.length > 0 && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
          <input
            value={search}
            placeholder="Поиск по почте или коду"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // Вставили токен клиента целиком — оставляем в поле только его почту и ищем по ней
            onChange={(e) => setSearch(parseSessionToken(e.target.value.trim())?.email || e.target.value)}
            className="w-full h-11 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-[14px] pl-10 pr-10 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 active:scale-90 transition-all"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      {(actors.length > 0 || actor) && (
        // Кнопки-люди: все заказы или только оформленные одним человеком
        // Переключатель — как у тарифов выше, на всю ширину
        <div className="mb-3 flex bg-neutral-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 relative">
          <div
            className="absolute inset-y-1.5 left-1.5 bg-neutral-700 rounded-xl transition-transform duration-200 ease-out"
            style={{
              width: `calc((100% - 12px) / ${actorTabs.length})`,
              transform: `translateX(${actorTabs.findIndex((a) => a.name === actor) * 100}%)`,
            }}
          />
          {actorTabs.map((a) => (
            <motion.button
              key={a.name}
              onTap={() => setActor(a.name)}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 min-w-0 px-1 py-2.5 text-[13px] font-semibold whitespace-nowrap truncate transition-colors ${
                actor === a.name ? (ACTOR_COLORS[a.name.toLowerCase()] ?? "text-white") : "text-neutral-500"
              }`}
            >
              {a.name || "Все"} <span className="font-normal tabular-nums opacity-60">{a.count}</span>
            </motion.button>
          ))}
        </div>
      )}
      {days.length > 0 && (
        // Кнопки-дни: нажатие показывает заказы этого дня, повторное — снова всю историю.
        // Первая кнопка «Все» (date пустой) — тоже вся история; счётчика у неё нет
        <div className="-mx-6 px-6 mb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[{ date: "", count: -1 }, ...days].map((d) => (
            <button
              key={d.date}
              onClick={() => setDay(day === d.date ? "" : d.date)}
              // День без заказов — приглушённый, со счётчиком 0
              className={`shrink-0 h-10 rounded-[14px] border flex items-center gap-2 active:scale-95 transition-all ${
                d.date ? "pl-3.5 pr-2.5" : "px-3.5"
              } ${d.count === 0 && day !== d.date ? "opacity-40" : ""} ${
                day === d.date ? "bg-[#12c83b]/10 border-[#12c83b]/40" : "bg-white/[0.04] border-white/10"
              }`}
            >
              <span className={`text-[14px] font-semibold tabular-nums ${day === d.date ? "text-white" : "text-neutral-300"}`}>
                {d.date ? `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}` : "Все"}
              </span>
              {d.date && (
                <span className="min-w-6 h-6 px-1.5 rounded-full bg-[#12c83b]/15 flex items-center justify-center text-[12px] font-semibold tabular-nums text-[#12c83b]">
                  {d.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {ordersError ? (
        <div className="py-6 text-center text-[13px] text-red-400">{ordersError}</div>
      ) : orders === null ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-neutral-500" />
        </div>
      ) : shown.length === 0 && !hasMore ? (
        <div className="py-6 text-center text-[13px] text-neutral-600">
          {day || actor || needle ? "Таких оформлений нет" : "Оформлений пока нет"}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.slice(0, visibleCount).map((order) => (
            <div key={order.id} className="px-4 py-3 rounded-[16px] bg-white/[0.04] border border-white/5">
              <div className="flex items-baseline justify-between gap-3">
                {order.email ? (
                  <button
                    onClick={() => copyField(`${order.id}:email`, order.email)}
                    className={`min-w-0 truncate text-left text-[15px] font-semibold transition-colors ${
                      copiedField === `${order.id}:email` ? "text-[#12c83b]" : "text-white"
                    }`}
                  >
                    {order.email}
                  </button>
                ) : (
                  <div className="min-w-0 truncate text-[15px] font-semibold text-white">Без почты</div>
                )}
                <div className="shrink-0 text-[14px] tabular-nums text-neutral-500">
                  {historyDate.format(new Date(order.createdAt))}
                </div>
              </div>
              <div className="mt-1 flex items-start justify-between gap-3">
                {/* Слева: тариф и справа от него код (сначала половина с многоточием, нажатие копирует код
                    и раскрывает его целиком), ниже — причина отказа и потраченное */}
                <div className="min-w-0 flex-1">
                  <div className="min-h-7 flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="shrink-0 font-semibold text-[#12c83b]">{order.label}</span>
                    <button
                      onClick={() => {
                        copyField(`${order.id}:code`, order.code);
                        setOpenCodes((prev) => new Set(prev).add(order.id));
                      }}
                      className={`min-w-0 text-left text-[12px] break-all transition-colors ${
                        copiedField === `${order.id}:code` ? "text-[#12c83b]" : "text-neutral-400"
                      }`}
                    >
                      {openCodes.has(order.id) ? order.code : `${order.code.slice(0, Math.ceil(order.code.length / 2))}…`}
                    </button>
                  </div>
                  {order.status === "rejected" && order.reason && (
                    <div className="mt-0.5 text-[13px] text-red-400">{order.reason}</div>
                  )}
                  {order.spentUsd != null && (
                    <div className="mt-1 text-[13px] text-neutral-500">
                      Потрачено: <span className="font-semibold tabular-nums text-white">≈ ${order.spentUsd.toFixed(2)}</span>
                      {usdtRate > 0 && (
                        <span className="tabular-nums">
                          {" "}
                          · {Math.round(order.spentUsd * usdtRate).toLocaleString("ru-RU")} ₽
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Справа: статус и сразу под ним — кто оформил */}
                <div className="shrink-0 max-w-[45%] flex flex-col items-end gap-1">
                  <div
                    className={`h-7 px-3 rounded-full border flex items-center text-[14px] font-semibold ${STATUS[order.status].className}`}
                  >
                    {STATUS[order.status].label}
                  </div>
                  {order.actor && (
                    <div
                      className={`max-w-full truncate text-[15px] font-semibold ${
                        ACTOR_COLORS[order.actor.toLowerCase()] ?? "text-neutral-300"
                      }`}
                    >
                      {order.actor}
                    </div>
                  )}
                </div>
              </div>
              {order.status === "success" && RENEWAL_MANUAL.has(order.renewalStatus ?? "") && (
                <div className="mt-1.5 text-[12px] text-amber-400">
                  Автопродление не отключилось — отключите его вручную в ChatGPT клиента
                </div>
              )}
            </div>
          ))}
          {(shown.length > visibleCount || hasMore) && (
            <button
              onClick={showMore}
              disabled={isLoadingMore}
              className="mt-2 h-11 rounded-[16px] bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            >
              {isLoadingMore && <Loader2 size={14} className="animate-spin" />}
              Показать ещё
            </button>
          )}
        </div>
      )}

      <Modal open={isConfirmOpen} title="Оформление" Icon={Sparkles} onClose={closeConfirm}>
        <div className="px-4 py-3 rounded-[16px] bg-white/[0.04] border border-white/5">
          <div className="text-[11px] text-neutral-500">Почта клиента</div>
          <div className="text-[15px] font-semibold text-white break-all">{session?.email || "Не указана"}</div>
          <div className="mt-2 text-[11px] text-neutral-500">Тариф</div>
          <div className="text-[15px] font-semibold text-[#12c83b]">{label}</div>
          {price?.amountUsd != null && !usedCode && (
            <>
              <div className="mt-2 text-[11px] text-neutral-500">Спишется с баланса ZovoCard</div>
              <div className="text-[15px] font-semibold text-white tabular-nums">
                ≈ ${(price.amountUsd + price.feeUsd).toFixed(2)}
              </div>
            </>
          )}
          {usedCode && (
            <>
              <div className="mt-2 text-[11px] text-neutral-500">Код CDK отправлен на оформление</div>
              <button onClick={copyUsedCode} className="w-full flex items-center justify-between gap-2 text-left">
                <span className="text-[15px] font-semibold text-white break-all">{usedCode}</span>
                {copied ? (
                  <Check size={16} className="shrink-0 text-[#12c83b]" />
                ) : (
                  <Copy size={16} className="shrink-0 text-neutral-400" />
                )}
              </button>
            </>
          )}
        </div>
        {usedCode && (
          <div className="mt-3 text-[13px] text-neutral-400">
            Заказ принят. Отметка «Успешно» или «Отклонено» появится в истории, когда сервис закончит оформление.
          </div>
        )}
        {activePlan && !usedCode && (
          <div className="mt-3 text-[13px] text-amber-400">
            У клиента уже есть подписка ({activePlan}). ZovoCard, скорее всего, откажет в оформлении.
          </div>
        )}
        {shortage && !usedCode && (
          <div className="mt-3 text-[13px] text-red-400">
            Не хватает денег на балансе ZovoCard: нужно ≈ {usd(shortage.need)}, а на балансе {usd(balance?.amount ?? 0)}.
            {shortage.card?.minRecharge != null && shortage.topUp === shortage.card.minRecharge && (
              <>
                {" "}
                На карте {shortage.card.last4} только {usd(shortage.card.balance)}, а пополнить её можно не меньше чем
                на {usd(shortage.card.minRecharge)}.
              </>
            )}
          </div>
        )}
        {error && <div className="mt-2 text-red-500 text-xs text-center">{error}</div>}
        {usedCode ? (
          <button onClick={closeConfirm} className={primaryButton}>
            Готово
          </button>
        ) : (
          <button
            onClick={confirmOrder}
            // Денег не хватает — не оформляем: иначе код купится, а подписку оплатить будет нечем
            disabled={isBusy || Boolean(shortage)}
            className={primaryButton}
          >
            {isBusy && <Loader2 size={16} className="animate-spin" />}
            {isBusy ? "Оформляем, до минуты…" : shortage ? "Пополните баланс" : "Подтвердить оформление"}
          </button>
        )}
      </Modal>
    </div>
  );
}
