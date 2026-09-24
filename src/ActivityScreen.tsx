import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  RotateCw,
  X,
  History,
  ShoppingCart,
  Gamepad2,
  UserPlus,
  Inbox,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { currentActor } from "./config";

type ActivityEvent = {
  id: string;
  type: string;
  action: string;
  title: string;
  details: string;
  login: string;
  gameName: string;
  actor: string;
  price: number | null;
  createdAt: string;
  sortAt?: string;
  editedAt?: string | null;
  restoredAt?: string | null;
};

// Время последнего действия с записью — по нему лента отсортирована
const activityTime = (e: ActivityEvent) => e.sortAt ?? e.createdAt;

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const TYPES = [
  { id: "all", label: "Все" },
  { id: "order", label: "Заказы" },
  { id: "game", label: "Игры" },
  { id: "account", label: "Аккаунты" },
];

const TYPE_STYLE: Record<string, { icon: any; color: string }> = {
  order: { icon: ShoppingCart, color: "text-green-400 bg-green-500/10 border-green-500/20" },
  game: { icon: Gamepad2, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  account: { icon: UserPlus, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  empty: { icon: Inbox, color: "text-neutral-300 bg-white/5 border-white/10" },
};

const DELETED_STYLE = { icon: Trash2, color: "text-red-400 bg-red-500/10 border-red-500/20" };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

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

// Что произойдёт при удалении записи — показывается перед подтверждением
const UNDO_HINT: Record<string, string> = {
  order_add: "Заказ удалится, занятый им слот освободится.",
  order_return: "Возврат удалится, слот снова станет занят.",
  account_add: "Аккаунт удалится. Если на нём есть заказы — сначала удалите их.",
  account_expense: "У аккаунта вернётся прежний расход.",
  game_add: "Игра удалится из каталога. Если есть аккаунты — сначала удалите их.",
  edition_add: "Издание удалится. Если есть аккаунты — сначала удалите их.",
  game_update: "Игра вернётся к виду до изменения.",
  empty_add: "Пустой аккаунт удалится.",
  empty_update: "У пустого аккаунта вернутся прежние данные.",
  empty_trash: "Аккаунт вернётся из корзины.",
  empty_restore: "Аккаунт снова уйдёт в корзину.",
};

const ACTIVITY_CACHE_KEY = "cached_activity";

export default function ActivityScreen({ API_URL, footer, variables, fetchItems }: any) {
  const [editing, setEditing] = useState<ActivityEvent | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("all");

  // Последняя загруженная лента — показываем сразу, свежую подтягиваем в фоне
  const [events, setEvents] = useState<ActivityEvent[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(ACTIVITY_CACHE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
          action: "getActivity",
          search: debouncedSearch,
          type,
          offset,
        }),
      });
      const result = await response.json();
      if (id !== requestId.current) return;
      if (result.success) {
        setEvents((prev) => (offset === 0 ? result.events : [...prev, ...result.events]));
        setHasMore(result.hasMore);
        if (offset === 0 && !debouncedSearch && type === "all") {
          try {
            localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(result.events));
          } catch {
            // кэш необязателен
          }
        }
      } else {
        setError(result.error || "Не удалось загрузить историю");
      }
    } catch (e) {
      if (id === requestId.current) setError("Ошибка сети");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    load(0);
  }, [debouncedSearch, type]);

  const groups = useMemo(() => {
    const result: { label: string; items: ActivityEvent[] }[] = [];
    for (const e of events) {
      const label = dayLabel(activityTime(e));
      const last = result[result.length - 1];
      if (last && last.label === label) last.items.push(e);
      else result.push({ label, items: [e] });
    }
    return result;
  }, [events]);

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
            <h1 className="text-xl font-medium tracking-[0.02em] text-white">История</h1>
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
              placeholder="Игра, логин, клиент"
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
          {TYPES.map((t) => (
            <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-4 pb-36">
        {notice && (
          <div
            onClick={() => setNotice("")}
            className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[13px] rounded-2xl p-3.5"
          >
            {notice}
          </div>
        )}

        {error && <div className="text-center text-red-500 text-sm py-4">{error}</div>}

        {!isLoading && !error && events.length === 0 && (
          <div className="text-center text-neutral-500 text-sm pt-16">Записей не найдено</div>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
              {group.label}
            </div>
            <div className="space-y-2">
              {group.items.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => setEditing(e)} />
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
            onClick={() => load(events.length)}
            className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm font-semibold active:scale-95 transition-all"
          >
            Показать ещё
          </button>
        )}

        {footer}
      </div>

      <AnimatePresence>
        {editing && (
          <EditSheet
            event={editing}
            API_URL={API_URL}
            variables={variables}
            onClose={() => setEditing(null)}
            onDone={(message: string) => {
              setEditing(null);
              setNotice(message);
              load(0);
              fetchItems?.(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EventCard({ event, onClick }: { event: ActivityEvent; onClick: () => void }) {
  const style =
    event.action === "deleted"
      ? DELETED_STYLE
      : TYPE_STYLE[event.type] ?? TYPE_STYLE.empty;
  const Icon = style.icon;
  const time = new Date(activityTime(event)).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const price = Number(event.price);
  const hasPrice = event.price !== null && !isNaN(price);

  return (
    <div
      onClick={onClick}
      className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex gap-3 cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div
        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${style.color}`}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-white">{event.title}</span>
          <div className="flex flex-col items-end shrink-0">
            {hasPrice && (
              <span
                className={`text-[14px] font-bold ${price < 0 ? "text-red-400" : "text-green-400"}`}
              >
                {price > 0 ? "+" : ""}
                {price.toLocaleString("ru-RU")} ₽
              </span>
            )}
            <span className="text-xs text-neutral-500">{time}</span>
          </div>
        </div>
        {event.details && (
          <div className="text-[12px] text-neutral-300 mt-1 break-words">{event.details}</div>
        )}
        {(event.login || event.editedAt || event.restoredAt) && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
            {event.restoredAt && (
              <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-300">
                восстановлено
              </span>
            )}
            {event.editedAt && (
              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300">изменено</span>
            )}
            {event.login && <span className="text-neutral-500 truncate">{event.login}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors";

function ChipSelect({ options, value, onChange }: any) {
  const list: string[] = options.includes(value) || !value ? options : [value, ...options];
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border transition-all ${
            value === o
              ? "bg-white text-black border-white"
              : "bg-white/5 text-white/80 border-white/10"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// Поля записи, которые можно менять, и подписи к ним
const TEXT_FIELDS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "client", label: "Клиент" },
  { key: "price", label: "Цена, ₽", numeric: true },
  { key: "login", label: "Логин" },
  { key: "expense", label: "Расход, ₽", numeric: true },
  { key: "name", label: "Название" },
  { key: "edition", label: "Издание" },
  { key: "email", label: "Почта" },
];

function EditSheet({ event, API_URL, variables, onClose, onDone }: any) {
  const [fields, setFields] = useState<Record<string, any> | null>(null);
  const [linked, setLinked] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const post = async (body: any) => {
    const response = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
    return response.json();
  };

  useEffect(() => {
    post({ action: "getActivityItem", id: event.id })
      .then((result) => {
        if (result.success) {
          setFields(result.fields);
          setLinked(result.linked);
        } else {
          setError(result.error || "Не удалось загрузить запись");
          setFields({});
        }
      })
      .catch(() => {
        setError("Ошибка сети");
        setFields({});
      });
  }, [event.id]);

  const set = (key: string) => (value: any) =>
    setFields((prev) => ({ ...(prev ?? {}), [key]: value }));

  const run = async (body: any, success: (result: any) => string) => {
    setIsBusy(true);
    setError("");
    try {
      const result = await post(body);
      if (result.success) onDone(success(result));
      else setError(result.error || "Ошибка");
    } catch (e) {
      setError("Ошибка сети");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = () => run({ action: "updateActivity", id: event.id, fields }, () => "");

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run({ action: "deleteActivity", id: event.id, actor: currentActor() }, (result) =>
      (result.warnings ?? []).join(". ")
    );
  };

  const handleRestore = () => run({ action: "restoreActivity", id: event.id }, () => "");

  const isDeleted = event.action === "deleted";
  const hasFields = linked && fields !== null && Object.keys(fields).length > 0;
  const regions: string[] = (variables?.regions ?? []).map((r: any) => r.code);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#1a1a1c] border-t border-white/10 rounded-t-[30px] p-6 pb-10 max-h-[90dvh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
        >
          <X size={18} />
        </button>

        <h3 className="text-lg font-bold text-white pr-10">{event.title}</h3>
        {event.details && <div className="text-[13px] text-neutral-400 mt-1 pr-6">{event.details}</div>}
        {event.login && <div className="text-[12px] text-neutral-500 mt-1">{event.login}</div>}
        <div className="text-[12px] text-neutral-500 mt-1">
          {fullDate(event.createdAt)}
          {event.restoredAt && ` · восстановлено ${fullDate(event.restoredAt)}`}
          {event.editedAt && ` · изменено ${fullDate(event.editedAt)}`}
        </div>

        <div className="mt-5">
          {fields === null ? (
            <div className="flex justify-center py-6">
              <Loader2 size={22} className="animate-spin text-green-500" />
            </div>
          ) : isDeleted ? (
            <div className="text-[13px] text-neutral-400 bg-white/5 rounded-2xl p-3.5">
              Всё, что убрало это удаление, можно вернуть: исходная запись и данные в приложении
              восстановятся.
            </div>
          ) : !linked ? (
            <div className="text-[13px] text-neutral-400 bg-white/5 rounded-2xl p-3.5">
              Исходные данные этой записи уже удалены или её нельзя отменить. Можно только убрать
              запись из истории.
            </div>
          ) : (
            <>
              {TEXT_FIELDS.filter((f) => f.key in fields).map((f) => (
                <Field key={f.key} label={f.label}>
                  <input
                    className={inputClass}
                    inputMode={f.numeric ? "decimal" : undefined}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => set(f.key)(e.target.value)}
                  />
                </Field>
              ))}
              {"paymentMethod" in fields && (
                <Field label="Способ оплаты">
                  <ChipSelect
                    options={variables?.paymentMethods ?? []}
                    value={fields.paymentMethod}
                    onChange={set("paymentMethod")}
                  />
                </Field>
              )}
              {"employee" in fields && (
                <Field label="Сотрудник">
                  <ChipSelect
                    options={variables?.employees ?? []}
                    value={fields.employee}
                    onChange={set("employee")}
                  />
                </Field>
              )}
              {"region" in fields && (
                <Field label="Регион">
                  <ChipSelect options={regions} value={fields.region} onChange={set("region")} />
                </Field>
              )}
              {!hasFields && (
                <div className="text-[13px] text-neutral-400 bg-white/5 rounded-2xl p-3.5">
                  В этой записи нечего менять — её можно только отменить.
                </div>
              )}
            </>
          )}
        </div>

        {error && <div className="text-red-500 text-sm mt-3">{error}</div>}

        {fields !== null && (
          <div className="mt-5 space-y-2.5">
            {hasFields && (
              <button
                onClick={handleSave}
                disabled={isBusy}
                className="w-full py-3.5 bg-[#12c83b] text-black font-bold rounded-2xl active:scale-95 transition-all disabled:opacity-50"
              >
                {isBusy && !confirmDelete ? "Сохранение..." : "Сохранить"}
              </button>
            )}

            {isDeleted && (
              <button
                onClick={handleRestore}
                disabled={isBusy}
                className="w-full py-3.5 bg-[#12c83b] text-black font-bold rounded-2xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                {isBusy && !confirmDelete ? "Восстановление..." : "Восстановить"}
              </button>
            )}

            {confirmDelete && (
              <div className="text-[13px] text-red-300/90 px-1">
                {isDeleted
                  ? "Запись об удалении пропадёт, восстановить данные будет уже нельзя."
                  : linked
                  ? (UNDO_HINT[event.action] ?? "Запись удалится из истории.") +
                    " Удаление появится в истории, его можно будет восстановить."
                  : "Запись удалится из истории, данные в приложении не изменятся."}
              </div>
            )}
            <button
              onClick={handleDelete}
              disabled={isBusy}
              className={`w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 border active:scale-95 transition-all disabled:opacity-50 ${
                confirmDelete
                  ? "bg-red-500 text-white border-red-400"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              <Trash2 size={16} />
              {confirmDelete
                ? isBusy
                  ? "Удаление..."
                  : "Точно удалить"
                : isDeleted
                ? "Убрать из истории навсегда"
                : linked
                ? "Удалить и отменить действие"
                : "Убрать из истории"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
