import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "../config";
import { PRODUCTS } from "./CdkTokens";

// Сколько рублей сотрудник с ролью gpt должен сверх закупочной цены за каждую оформленную подписку
const MARKUP_RUB = 50;

type Price = { amountUsd: number | null; feeUsd: number };
// Что отдаёт сервер: успешные оформления (кто, тариф, почта клиента), выплаты долга, цены, логины роли gpt
type DebtData = {
  // manual — подписку оформили в другом месте и записали в долг вручную
  // amount — долг за оформление, зафиксированный на сервере в момент оформления, ₽
  orders: { id: string; actor: string; label: string; email: string; manual?: boolean; amount?: number | null; createdAt: string }[];
  payments: { id: string; login: string; amount: number; createdAt: string }[];
  prices: Record<string, Price>;
  gptLogins: string[];
};

export const rub = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;

const historyDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Раз в минуту долг в шапке обновляется сам
const REFRESH_MS = 60_000;
// Последний ответ сервера храним в браузере: при открытии сайта долг виден сразу, а свежий подтягивается следом
const CACHE_KEY = "cached_cdk_debts";
// Сколько оформлений показываем сразу и добавляем кнопкой «Показать ещё»
const HISTORY_PAGE = 50;

function readCache(login: string): DebtData | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return saved?.login === login && Array.isArray(saved.data?.orders) && Array.isArray(saved.data?.payments)
      ? saved.data
      : null;
  } catch {
    return null;
  }
}

// Долги сотрудников с ролью gpt за оформленные подписки. За каждую успешную — закупочная цена тарифа
// (цена ZovoCard со сбором по курсу USDT из шапки) плюс наценка.
// Админ видит всех, сотрудник с ролью gpt — только себя; остальным ролям долги не считаем
export function useCdkDebts(apiUrl: string, usdtRate: number, role: string, login: string) {
  const enabled = role === "admin" || role === "gpt";
  const [data, setData] = useState<DebtData | null>(() => readCache(login));
  const [error, setError] = useState("");

  const reload = async () => {
    if (!enabled) return;
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "cdkOrders", op: "debts" }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      const fresh: DebtData = {
        orders: result.orders ?? [],
        payments: result.payments ?? [],
        prices: result.prices ?? {},
        gptLogins: result.gptLogins ?? [],
      };
      setData(fresh);
      setError("");
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ login, data: fresh }));
      } catch {
        // не сохранилось — в следующий раз просто подождём ответа сервера
      }
    } catch (e) {
      setError("Не удалось загрузить оформления");
    }
  };

  useEffect(() => {
    reload();
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  // Сколько должны за одно оформление тарифа (по его названию из заказа); null — цену или курс не знаем
  const debtFor = (label: string) => {
    const price = data?.prices[PRODUCTS.find((p) => p.label === label)?.plan ?? ""];
    if (!price || price.amountUsd == null || !(usdtRate > 0)) return null;
    return Math.round((price.amountUsd + price.feeUsd) * usdtRate) + MARKUP_RUB;
  };

  // Должники: сотрудник с ролью gpt видит только себя, админ — всех с этой ролью
  const debtors = new Set((role === "gpt" ? [login] : (data?.gptLogins ?? [])).map((name) => name.toLowerCase()));
  // Оформления должников, у каждого — сумма долга за него
  const orders = (data?.orders ?? [])
    .filter((order) => debtors.has(order.actor.toLowerCase()))
    // Сумма фиксируется на сервере при оформлении и потом не меняется. Если сервер её не прислал
    // (миграция не применена или не было цены) — считаем по сегодняшним ценам
    .map((order) => ({ ...order, kind: "order" as const, amount: order.amount ?? debtFor(order.label) }));
  // Выплаты должников: то, что они уже отдали
  const payments = (data?.payments ?? [])
    .filter((payment) => debtors.has(payment.login.toLowerCase()))
    .map((payment) => ({ ...payment, kind: "payment" as const }));
  // История: оформления и выплаты вперемешку, новые сверху
  const history = [...orders, ...payments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Отметить, что часть долга отдана; возвращает текст ошибки или пустую строку
  const pay = async (amount: number) => {
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "cdkOrders", op: "debtPay", amount }),
      });
      const result = await response.json();
      if (!result.success) return String(result.error || "Не удалось записать");
      await reload();
      return "";
    } catch (e) {
      return "Ошибка сети";
    }
  };

  // Записать в долг подписку, оформленную в другом месте. product — ключ тарифа ("Plus|1"),
  // login — на кого записать (нужен только админу); возвращает текст ошибки или пустую строку
  const addManual = async (product: string, email: string, debtor: string) => {
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "cdkOrders", op: "debtAdd", product, email, login: debtor }),
      });
      const result = await response.json();
      if (!result.success) return String(result.error || "Не удалось записать");
      await reload();
      return "";
    } catch (e) {
      return "Ошибка сети";
    }
  };

  // Убрать из долга подписку, добавленную вручную; возвращает текст ошибки или пустую строку
  const removeManual = async (id: string) => {
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "cdkOrders", op: "debtRemove", id }),
      });
      const result = await response.json();
      if (!result.success) return String(result.error || "Не удалось удалить");
      await reload();
      return "";
    } catch (e) {
      return "Ошибка сети";
    }
  };

  // Долг одного сотрудника: за его оформления минус то, что он уже отдал
  const debtOf = (name: string) => {
    const target = name.toLowerCase();
    const own = orders.filter((order) => order.actor.toLowerCase() === target);
    return {
      total:
        own.reduce((sum, order) => sum + (order.amount ?? 0), 0) -
        payments
          .filter((payment) => payment.login.toLowerCase() === target)
          .reduce((sum, payment) => sum + payment.amount, 0),
      isPartial: own.some((order) => order.amount === null),
    };
  };

  return {
    enabled,
    isLoading: data === null,
    error,
    history,
    // Логины всех сотрудников с ролью gpt
    gptLogins: data?.gptLogins ?? [],
    debtOf,
    // Общий долг — за оформления минус уже отданное: у админа — всех сотрудников, у сотрудника — его собственный
    total:
      orders.reduce((sum, order) => sum + (order.amount ?? 0), 0) -
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    // Есть оформление без цены — итог неполный
    isPartial: orders.some((order) => order.amount === null),
    // Отдавать долг может только сам должник
    canPay: role === "gpt",
    pay,
    debtFor,
    // Админ выбирает, на кого записать подписку вручную; сотрудник записывает только на себя
    picksDebtor: role === "admin",
    addManual,
    removeManual,
    reload,
  };
}

// Страница «Долги»: общий долг крупно и под ним история оформлений — почта клиента и сумма за него
export default function CdkDebts({
  debts,
  usdtRate,
  showActor,
  onClose,
}: {
  debts: ReturnType<typeof useCdkDebts>;
  usdtRate: number;
  // Админу показываем, кто оформил: в его истории оформления разных сотрудников
  showActor: boolean;
  onClose: () => void;
}) {
  const { error, history } = debts;
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE);
  // Сколько отдаёт сотрудник: поле над историей
  const [payDraft, setPayDraft] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const payAmount = Number(payDraft);

  const submitPay = async () => {
    if (isPaying || !(payAmount > 0) || payAmount > debts.total) return;
    setIsPaying(true);
    const failure = await debts.pay(payAmount);
    setPayError(failure);
    if (!failure) setPayDraft("");
    setIsPaying(false);
  };

  // Форма «добавить подписку вручную»: тариф, почта клиента и (у админа) на кого записать
  const [isAdding, setIsAdding] = useState(false);
  const [addProduct, setAddProduct] = useState("Plus|1");
  const [addEmail, setAddEmail] = useState("");
  const [addLogin, setAddLogin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState("");
  // Сотрудник с ролью gpt один — выбирать некого
  const debtor = addLogin || (debts.gptLogins.length === 1 ? debts.gptLogins[0] : "");
  const addAmount = debts.debtFor(PRODUCTS.find((p) => p.key === addProduct)?.label ?? "");
  const canAdd = !isSaving && (!debts.picksDebtor || debtor !== "");

  const submitAdd = async () => {
    if (!canAdd) return;
    setIsSaving(true);
    const failure = await debts.addManual(addProduct, addEmail.trim(), debtor);
    setAddError(failure);
    if (!failure) {
      setAddEmail("");
      setIsAdding(false);
    }
    setIsSaving(false);
  };

  // Удаление записи, добавленной вручную: первое нажатие на корзину просит подтвердить, второе удаляет
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [removeError, setRemoveError] = useState("");

  const submitRemove = async (id: string) => {
    if (removingId) return;
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      setRemoveError("");
      return;
    }
    setRemovingId(id);
    setRemoveError(await debts.removeManual(id));
    setConfirmRemoveId("");
    setRemovingId("");
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
      className="fixed inset-0 z-50 bg-[#121212] flex flex-col mx-auto max-w-md border-x border-white/5 h-[100dvh] overflow-hidden"
    >
      <div
        className="shrink-0 flex items-center gap-2 px-4 pb-3 border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 0.75rem)" }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-neutral-300 active:scale-90 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-lg font-bold text-white tracking-tight">Долги</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-10" style={{ scrollbarWidth: "none" }}>
        {error && debts.isLoading ? (
          <div className="py-6 text-center text-[13px] text-red-400">{error}</div>
        ) : debts.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : (
          <>
            <div className="py-6 text-center">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">Сумма долга</div>
              <div className="mt-1 text-[40px] leading-none font-bold tabular-nums text-white">
                {debts.isPartial && "от "}
                {rub(debts.total)}
              </div>
              <div className="mt-2 text-[13px] text-neutral-500">
                За каждую подписку — закупочная цена + {MARKUP_RUB} ₽
              </div>
              {!(usdtRate > 0) && (
                <div className="mt-2 text-[13px] text-amber-400">Курс USDT в шапке не задан — посчитать долг нельзя.</div>
              )}
            </div>

            {debts.canPay && (
              <div className="mb-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payDraft}
                    placeholder="Сумма, ₽"
                    disabled={isPaying}
                    onChange={(e) => {
                      setPayDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 9));
                      setPayError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitPay();
                    }}
                    className="flex-1 min-w-0 h-12 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-[14px] px-4 text-[16px] font-semibold tabular-nums text-white outline-none transition-colors placeholder:text-neutral-600 placeholder:font-normal"
                  />
                  <button
                    onClick={submitPay}
                    disabled={isPaying || !(payAmount > 0) || payAmount > debts.total}
                    className="shrink-0 h-12 px-6 rounded-[14px] bg-[#12c83b] text-black text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {isPaying && <Loader2 size={16} className="animate-spin" />}
                    Отдать
                  </button>
                </div>
                {payAmount > debts.total ? (
                  <div className="mt-2 px-1 text-[13px] text-amber-400">Это больше, чем долг.</div>
                ) : (
                  payError && <div className="mt-2 px-1 text-[13px] text-red-400">{payError}</div>
                )}
              </div>
            )}

            <div className="mb-6">
              {isAdding ? (
                <div className="p-4 rounded-[16px] bg-white/[0.04] border border-white/10 flex flex-col gap-3">
                  <div className="text-[13px] text-neutral-500">
                    Подписка оформлена в другом месте — запишем её в долг по обычной цене тарифа.
                  </div>
                  {debts.picksDebtor && debts.gptLogins.length !== 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {debts.gptLogins.length === 0 && (
                        <div className="text-[13px] text-amber-400">Нет сотрудников с ролью gpt.</div>
                      )}
                      {debts.gptLogins.map((name) => (
                        <button
                          key={name}
                          onClick={() => setAddLogin(name)}
                          className={`h-9 px-3 rounded-[12px] border text-[13px] font-semibold active:scale-95 transition-all ${
                            debtor === name
                              ? "bg-white text-black border-white"
                              : "bg-white/5 text-neutral-300 border-white/10"
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {PRODUCTS.map((product) => (
                      <button
                        key={product.key}
                        onClick={() => setAddProduct(product.key)}
                        className={`h-9 px-3 rounded-[12px] border text-[13px] font-semibold active:scale-95 transition-all ${
                          addProduct === product.key
                            ? "bg-white text-black border-white"
                            : "bg-white/5 text-neutral-300 border-white/10"
                        }`}
                      >
                        {product.tab}
                      </button>
                    ))}
                  </div>
                  <input
                    type="email"
                    value={addEmail}
                    placeholder="Почта клиента (необязательно)"
                    disabled={isSaving}
                    onChange={(e) => {
                      setAddEmail(e.target.value.slice(0, 200));
                      setAddError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAdd();
                    }}
                    className="h-12 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-[14px] px-4 text-[16px] text-white outline-none transition-colors placeholder:text-neutral-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsAdding(false);
                        setAddError("");
                      }}
                      disabled={isSaving}
                      className="shrink-0 h-12 px-5 rounded-[14px] bg-white/5 border border-white/10 text-[15px] font-semibold text-neutral-300 active:scale-95 transition-all disabled:opacity-40"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={submitAdd}
                      disabled={!canAdd}
                      className="flex-1 min-w-0 h-12 px-4 rounded-[14px] bg-white text-black text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                    >
                      {isSaving && <Loader2 size={16} className="animate-spin" />}
                      Добавить{addAmount !== null && ` · ${rub(addAmount)}`}
                    </button>
                  </div>
                  {addError && <div className="px-1 text-[13px] text-red-400">{addError}</div>}
                </div>
              ) : (
                <button
                  onClick={() => setIsAdding(true)}
                  className="w-full h-12 rounded-[14px] bg-white/5 border border-white/10 text-[15px] font-semibold text-neutral-300 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Plus size={18} />
                  Добавить подписку вручную
                </button>
              )}
            </div>

            <div className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-neutral-500">История</div>
            {removeError && <div className="mb-3 px-1 text-[13px] text-red-400">{removeError}</div>}
            {history.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-neutral-600">Записей пока нет</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {history.slice(0, visibleCount).map((entry) =>
                  entry.kind === "payment" ? (
                    <div
                      key={entry.id}
                      className="px-4 py-3 rounded-[16px] bg-[#12c83b]/10 border border-[#12c83b]/20 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold text-[#12c83b]">
                          Отдал {rub(entry.amount).replace("₽", "рублей")}
                        </div>
                        <div className="mt-0.5 truncate text-[13px] text-neutral-500">
                          <span className="tabular-nums">{historyDate.format(new Date(entry.createdAt))}</span>
                          {showActor && ` · ${entry.login}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-[15px] font-bold tabular-nums text-[#12c83b]">−{rub(entry.amount)}</div>
                    </div>
                  ) : (
                    <div
                      key={entry.id}
                      className="px-4 py-3 rounded-[16px] bg-white/[0.04] border border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold text-white">{entry.email || "Без почты"}</div>
                        <div className="mt-0.5 truncate text-[13px] text-neutral-500">
                          {entry.label} · <span className="tabular-nums">{historyDate.format(new Date(entry.createdAt))}</span>
                          {entry.manual && (
                            <>
                              {" · "}
                              <span className="text-[#12c83b]">вручную</span>
                            </>
                          )}
                          {showActor && ` · ${entry.actor}`}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <div className="text-[15px] font-bold tabular-nums text-white">
                          {entry.amount === null ? "—" : rub(entry.amount)}
                        </div>
                        {entry.manual && (
                          <button
                            onClick={() => submitRemove(entry.id)}
                            disabled={removingId !== ""}
                            className={`h-9 rounded-[12px] border flex items-center justify-center text-[13px] font-semibold active:scale-90 transition-all disabled:opacity-40 ${
                              confirmRemoveId === entry.id
                                ? "px-3 bg-red-500/15 border-red-500/30 text-red-400"
                                : "w-9 bg-white/5 border-white/10 text-neutral-400"
                            }`}
                          >
                            {removingId === entry.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : confirmRemoveId === entry.id ? (
                              "Удалить?"
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
                {history.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount((count) => count + HISTORY_PAGE)}
                    className="mt-2 h-11 rounded-[16px] bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 flex items-center justify-center active:scale-95 transition-all"
                  >
                    Показать ещё
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
