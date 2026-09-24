import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Loader2, RotateCw, Hand, X, History } from "lucide-react";

type Order = {
  id: string;
  login: string;
  gameName: string;
  edition: string;
  client: string;
  slot: string;
  price: number | null;
  paymentMethod: string;
  employee: string;
  event: string;
  createdAt: string;
};

type Totals = { count: number; revenue: number; refunds: number; net: number };

const PERIODS = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "all", label: "Всё время" },
];

const KINDS = [
  { id: "all", label: "Все" },
  { id: "orders", label: "Продажи" },
  { id: "returns", label: "Возвраты" },
  { id: "manual", label: "Ручные" },
];

function periodStart(period: string): string | undefined {
  if (period === "all") return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "7d") d.setDate(d.getDate() - 6);
  if (period === "30d") d.setDate(d.getDate() - 29);
  return d.toISOString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

function Chip({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-2 mr-2 rounded-[12px] text-[12px] font-semibold transition-all border ${
        active
          ? "bg-white text-black border-white"
          : "bg-white/5 text-white/80 border-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export default function OrdersHistoryScreen({ API_URL, variables, footer }: any) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [period, setPeriod] = useState("30d");
  const [kind, setKind] = useState("all");
  const [employee, setEmployee] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = async (offset = 0) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "getOrders",
          search: debouncedSearch,
          kind,
          employee,
          from: periodStart(period),
          offset,
        }),
      });
      const result = await response.json();
      if (id !== requestId.current) return;
      if (result.success) {
        setOrders((prev) => (offset === 0 ? result.orders : [...prev, ...result.orders]));
        setHasMore(result.hasMore);
        setTotals(result.totals);
      } else {
        setError(result.error || "Не удалось загрузить заказы");
      }
    } catch (e) {
      if (id === requestId.current) setError("Ошибка сети");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    load(0);
  }, [debouncedSearch, kind, employee, period]);

  const groups = useMemo(() => {
    const result: { label: string; items: Order[] }[] = [];
    for (const o of orders) {
      const label = dayLabel(o.createdAt);
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(o);
      else result.push({ label, items: [o] });
    }
    return result;
  }, [orders]);

  const employees: string[] = variables?.employees ?? [];

  return (
    <div className="flex flex-col h-[100dvh] bg-[#121212] overflow-hidden">
      <div className="shrink-0 bg-[#1a1a1a]/90 backdrop-blur-xl border-b border-white/5 pb-3 rounded-b-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div
          className="flex items-center px-6 justify-between"
          style={{
            height: "calc(4rem + env(safe-area-inset-top, 24px))",
            paddingTop: "calc(env(safe-area-inset-top, 24px) + 0.5rem)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
              <History size={16} className="text-white" />
            </div>
            <h1 className="text-xl font-medium tracking-[0.02em] text-white">
              История заказов
            </h1>
          </div>
          <button
            onClick={() => load(0)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-white/10 bg-black/20 active:scale-90 transition-all"
          >
            <RotateCw
              size={18}
              className={isLoading ? "animate-spin text-green-500" : "text-white"}
            />
          </button>
        </div>

        <div className="px-4 mt-1">
          <div className="flex items-center gap-2 bg-[#1c1c1e] border border-white/10 rounded-xl px-3">
            <Search size={16} className="text-neutral-500 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Клиент, логин или игра"
              className="flex-1 bg-transparent py-3 text-[16px] text-white outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-neutral-500">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex overflow-x-auto hide-scrollbar pl-4 mt-3">
          {PERIODS.map((p) => (
            <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex overflow-x-auto hide-scrollbar pl-4 mt-2">
          {KINDS.map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </Chip>
          ))}
        </div>
        {employees.length > 0 && (
          <div className="flex overflow-x-auto hide-scrollbar pl-4 mt-2">
            <Chip active={employee === ""} onClick={() => setEmployee("")}>
              Все сотрудники
            </Chip>
            {employees.map((name) => (
              <Chip key={name} active={employee === name} onClick={() => setEmployee(name)}>
                {name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-4 pb-36">
        {totals && kind !== "manual" && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
              <div className="text-[11px] text-neutral-500 mb-1">Записей</div>
              <div className="text-[15px] font-bold text-white">{totals.count}</div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
              <div className="text-[11px] text-neutral-500 mb-1">Выручка</div>
              <div className="text-[15px] font-bold text-green-400">{rub(totals.revenue)}</div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3">
              <div className="text-[11px] text-neutral-500 mb-1">Возвраты</div>
              <div className="text-[15px] font-bold text-red-400">{rub(totals.refunds)}</div>
            </div>
          </div>
        )}

        {error && <div className="text-center text-red-500 text-sm py-4">{error}</div>}

        {!isLoading && !error && orders.length === 0 && (
          <div className="text-center text-neutral-500 text-sm pt-16">Заказов не найдено</div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
              {group.label}
            </div>
            <div className="space-y-2">
              {group.items.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-center py-6 text-neutral-500">
            <Loader2 size={22} className="animate-spin text-green-500" />
          </div>
        )}

        {hasMore && !isLoading && (
          <button
            onClick={() => load(orders.length)}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm font-semibold active:scale-95 transition-all"
          >
            Показать ещё
          </button>
        )}

        {footer}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const time = new Date(order.createdAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const game = order.edition ? `${order.gameName} (${order.edition})` : order.gameName;

  if (order.event === "manual_free" || order.event === "manual_occupy") {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-amber-100 flex items-center gap-1.5">
            <Hand size={13} className="text-amber-400" />
            {order.event === "manual_free" ? "Слот освобождён вручную" : "Слот занят вручную"}
          </span>
          <span className="text-xs text-amber-300/80 shrink-0">{time}</span>
        </div>
        <div className="text-[12px] text-amber-400/80 mt-1.5 truncate">
          {game} · {order.slot}
        </div>
        <div className="text-[12px] text-neutral-500 mt-0.5 truncate">{order.login}</div>
      </div>
    );
  }

  const isReturn = order.slot.toLowerCase().includes("возврат");
  const price = Number(order.price);
  const hasPrice = order.price !== null && !isNaN(price);

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {order.client || "Без имени"}
          </div>
          <div className="text-[12px] text-neutral-300 mt-1 truncate">{game}</div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          {hasPrice && (
            <span className={`text-[14px] font-bold ${price < 0 ? "text-red-400" : "text-green-400"}`}>
              {price > 0 ? "+" : ""}
              {price.toLocaleString("ru-RU")} ₽
            </span>
          )}
          <span className="text-xs text-neutral-500 mt-1">{time}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
        <span
          className={`px-2 py-0.5 rounded-md ${
            isReturn ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
          }`}
        >
          {order.slot}
        </span>
        {order.employee && (
          <span className="px-2 py-0.5 rounded-md bg-white/5 text-neutral-400">{order.employee}</span>
        )}
        {order.paymentMethod && (
          <span className="px-2 py-0.5 rounded-md bg-white/5 text-neutral-400">{order.paymentMethod}</span>
        )}
      </div>
      <div className="text-[12px] text-neutral-500 mt-1.5 truncate">{order.login}</div>
    </div>
  );
}
