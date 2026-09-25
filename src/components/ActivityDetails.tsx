import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Pencil, Trash2, Check, Loader2, RotateCcw } from "lucide-react";
import { apiFetch } from "../config";

const TYPE_LABEL: Record<string, string> = {
  order: "Заказ",
  game: "Игра",
  account: "Аккаунт",
  empty: "Пустой аккаунт",
};

type InfoRow = { label: string; value: any; kind?: "date" | "price" | "mono" };

type FieldDef = {
  label: string;
  input: "text" | "number" | "select" | "datetime";
  half?: boolean;
  suffix?: string;
  options?: (variables: any) => string[];
};

// Порядок здесь — порядок полей в форме редактирования
const FIELD_DEFS: Record<string, FieldDef> = {
  client: { label: "Клиент", input: "text" },
  login: { label: "Логин", input: "text" },
  email: { label: "Почта", input: "text" },
  name: { label: "Название", input: "text" },
  edition: { label: "Издание", input: "text" },
  price: { label: "Цена", input: "number", suffix: "₽", half: true },
  paymentMethod: {
    label: "Способ оплаты",
    input: "select",
    half: true,
    options: (v) => v?.paymentMethods ?? [],
  },
  expense: { label: "Расход", input: "number", suffix: "₽" },
  employee: { label: "Сотрудник", input: "select", half: true, options: (v) => v?.employees ?? [] },
  date: { label: "Дата", input: "datetime" },
  region: {
    label: "Регион",
    input: "select",
    options: (v) => (v?.regions ?? []).map((r: any) => r.code),
  },
};

// Поля, которые в форме показываются только для справки (менять их нельзя)
const CONTEXT_LABELS = ["Логин", "Почта", "Игра", "Слот"];

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatValue(row: InfoRow) {
  if (row.kind === "date") {
    return new Date(row.value).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (row.kind === "price") return `${Number(row.value).toLocaleString("ru-RU")} ₽`;
  return String(row.value);
}

const inputClass =
  "w-full h-14 bg-white/[0.04] border border-white/10 rounded-[18px] px-5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors disabled:text-neutral-500";

function RoundButton({ onClick, className, children }: any) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      style={{ WebkitTapHighlightColor: "transparent" }}
      className={`h-12 rounded-full border flex items-center justify-center shrink-0 ${className}`}
    >
      {children}
    </motion.button>
  );
}

export default function ActivityDetails({
  event,
  style,
  undoHint,
  API_URL,
  variables,
  onClose,
  onDone,
}: any) {
  const [data, setData] = useState<{ fields: Record<string, any>; linked: boolean; info: InfoRow[] } | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const post = async (body: any) => {
    const response = await apiFetch(API_URL, { method: "POST", body: JSON.stringify(body) });
    return response.json();
  };

  useEffect(() => {
    post({ action: "getActivityItem", id: event.id })
      .then((result) => {
        if (result.success) setData(result);
        else {
          setError(result.error || "Не удалось загрузить запись");
          setData({ fields: {}, linked: false, info: [] });
        }
      })
      .catch(() => {
        setError("Ошибка сети");
        setData({ fields: {}, linked: false, info: [] });
      });
  }, [event.id]);

  const isDeleted = event.action === "deleted";
  const linked = data?.linked ?? false;
  const editableKeys = Object.keys(FIELD_DEFS).filter((key) => data && key in data.fields);
  const canEdit = !isDeleted && linked && editableKeys.length > 0;
  // Отменить можно и то, в чём нечего править (например, изменение цен)
  const canUndoWithoutEdit = !isDeleted && linked && editableKeys.length === 0;

  const startEdit = () => {
    const values: Record<string, any> = {};
    for (const key of editableKeys) {
      const value = data!.fields[key];
      values[key] = key === "date" ? toLocalInput(value) : value ?? "";
    }
    setDraft(values);
    setConfirmDelete(false);
    setError("");
    setMode("edit");
  };

  const run = async (body: any, message: (result: any) => string) => {
    setIsBusy(true);
    setError("");
    try {
      const result = await post(body);
      if (result.success) onDone(message(result));
      else setError(result.error || "Ошибка");
    } catch (e) {
      setError("Ошибка сети");
    } finally {
      setIsBusy(false);
    }
  };

  const save = () => {
    const fields = { ...draft };
    if (fields.date) fields.date = new Date(fields.date).toISOString();
    run({ action: "updateActivity", id: event.id, fields }, () => "");
  };

  const remove = () =>
    run({ action: "deleteActivity", id: event.id }, (result) =>
      (result.warnings ?? []).join(". ")
    );

  const restore = () => run({ action: "restoreActivity", id: event.id }, () => "");

  const Icon = style.icon;
  const caption = mode === "edit" ? "Редактирование" : isDeleted ? "Удалено" : TYPE_LABEL[event.type] ?? "Запись";

  const infoRows: InfoRow[] = [
    ...(data?.info ?? []),
    ...(event.restoredAt ? [{ label: "Восстановлено", value: event.restoredAt, kind: "date" as const }] : []),
    ...(event.editedAt ? [{ label: "Изменено", value: event.editedAt, kind: "date" as const }] : []),
  ];

  const deleteText = isDeleted
    ? "Запись об удалении пропадёт, восстановить данные будет уже нельзя."
    : linked
    ? `${undoHint ?? "Запись удалится из истории."} Удаление появится в истории, его можно будет восстановить.`
    : "Запись удалится из истории, данные в приложении не изменятся.";

  const renderField = (key: string) => {
    const def = FIELD_DEFS[key];
    const value = draft[key] ?? "";
    const set = (v: any) => setDraft((prev) => ({ ...prev, [key]: v }));
    let control;
    if (def.input === "select") {
      const options = def.options!(variables);
      const list = value && !options.includes(value) ? [value, ...options] : options;
      control = (
        <select value={value} onChange={(e) => set(e.target.value)} className={`${inputClass} appearance-none`}>
          <option value="">—</option>
          {list.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    } else if (def.input === "datetime") {
      control = (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => set(e.target.value)}
          className={`${inputClass} text-[15px] [color-scheme:dark]`}
        />
      );
    } else {
      control = (
        <div className="relative">
          <input
            value={value}
            inputMode={def.input === "number" ? "decimal" : undefined}
            onChange={(e) => set(e.target.value)}
            className={`${inputClass} ${def.suffix ? "pr-10" : ""}`}
          />
          {def.suffix && (
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-500">{def.suffix}</span>
          )}
        </div>
      );
    }
    return (
      <label key={key} className={def.half ? "col-span-1" : "col-span-2"}>
        <span className="block text-[14px] text-neutral-400 mb-2 ml-1">{def.label}</span>
        {control}
      </label>
    );
  };

  const contextRows = (data?.info ?? [])
    .filter(
      (row) =>
        CONTEXT_LABELS.includes(row.label) &&
        !editableKeys.some((key) => FIELD_DEFS[key].label === row.label)
    )
    .sort((a, b) => CONTEXT_LABELS.indexOf(a.label) - CONTEXT_LABELS.indexOf(b.label));

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", damping: 30, stiffness: 320 }}
      className="fixed inset-0 z-[300] max-w-md mx-auto flex flex-col h-[100dvh] bg-[#0f0f10]"
    >
      <div
        className="shrink-0 flex items-center gap-3 px-5 pb-4 bg-[#1a1a1c] border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 16px)" }}
      >
        <div className={`w-12 h-12 rounded-full border flex items-center justify-center shrink-0 ${style.color}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-neutral-500 font-medium">{caption}</div>
          <div className="text-[22px] font-bold text-white leading-tight truncate">{event.title}</div>
        </div>

        {mode === "view" && canEdit && (
          <RoundButton onClick={startEdit} className="px-4 gap-2 bg-white/[0.06] border-white/10 text-white text-[15px]">
            <Pencil size={16} /> Изменить
          </RoundButton>
        )}
        {mode === "view" && isDeleted && (
          <RoundButton
            onClick={restore}
            className="px-4 gap-2 bg-[#12c83b]/15 border-[#12c83b]/30 text-[#12c83b] text-[15px] font-semibold"
          >
            <RotateCcw size={16} /> Восстановить
          </RoundButton>
        )}
        {(mode === "edit" || canUndoWithoutEdit) && (
          <RoundButton
            onClick={() => setConfirmDelete(true)}
            className="w-12 bg-red-500/15 border-red-500/30 text-red-400"
          >
            <Trash2 size={18} />
          </RoundButton>
        )}
        <RoundButton
          onClick={() => (mode === "edit" ? setMode("view") : onClose())}
          className="w-12 bg-white/[0.06] border-white/10 text-neutral-300"
        >
          <X size={20} />
        </RoundButton>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-5 pb-6">
        {data === null ? (
          <div className="flex justify-center pt-16">
            <Loader2 size={24} className="animate-spin text-green-500" />
          </div>
        ) : mode === "view" ? (
          <div className="space-y-3">
            {infoRows.map((row, i) => (
              <div
                key={i}
                className="min-h-14 rounded-[20px] bg-white/[0.04] border border-white/10 px-5 py-3 flex items-center justify-between gap-4"
              >
                <span className="text-[14px] text-neutral-500 shrink-0">{row.label}</span>
                <span
                  className={`text-[15px] font-semibold text-white text-right break-all ${
                    row.kind === "mono" ? "font-mono font-normal" : ""
                  }`}
                >
                  {formatValue(row)}
                </span>
              </div>
            ))}
            {!linked && !isDeleted && (
              <div className="text-[13px] text-neutral-500 px-1 pt-1">
                Исходные данные этой записи уже удалены — её можно только убрать из истории.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {editableKeys.filter((key) => FIELD_DEFS[key].input === "text").map(renderField)}
            {contextRows.map((row) => (
              <label key={row.label} className={row.label === "Слот" ? "col-span-1" : "col-span-2"}>
                <span className="block text-[14px] text-neutral-400 mb-2 ml-1">{row.label}</span>
                <input disabled value={String(row.value)} className={inputClass} />
              </label>
            ))}
            {editableKeys.filter((key) => FIELD_DEFS[key].input !== "text").map(renderField)}
          </div>
        )}

        {error && <div className="text-red-500 text-sm mt-4 text-center">{error}</div>}
      </div>

      {data !== null && (confirmDelete || mode === "edit" || (!linked && !isDeleted) || isDeleted) && (
        <div className="shrink-0 px-5 pt-3 pb-8 bg-[#0f0f10] border-t border-white/5">
          {confirmDelete ? (
            <>
              <div className="text-[13px] text-red-300/90 mb-3">{deleteText}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={isBusy}
                  className="flex-1 h-14 rounded-[18px] bg-white/[0.06] border border-white/10 text-white font-semibold active:scale-95 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={remove}
                  disabled={isBusy}
                  className="flex-[1.6] h-14 rounded-[18px] bg-red-500 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Trash2 size={18} /> {isBusy ? "Удаление..." : "Удалить"}
                </button>
              </div>
            </>
          ) : mode === "edit" ? (
            <div className="flex gap-3">
              <button
                onClick={() => setMode("view")}
                disabled={isBusy}
                className="flex-1 h-14 rounded-[18px] bg-white/[0.06] border border-white/10 text-white font-semibold active:scale-95 transition-all"
              >
                Отмена
              </button>
              <button
                onClick={save}
                disabled={isBusy}
                className="flex-[1.6] h-14 rounded-[18px] bg-[#12c83b] text-black font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              >
                <Check size={18} strokeWidth={3} /> {isBusy ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full h-14 rounded-[18px] bg-red-500/10 border border-red-500/20 text-red-400 font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Trash2 size={16} /> {isDeleted ? "Убрать из истории навсегда" : "Убрать из истории"}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
