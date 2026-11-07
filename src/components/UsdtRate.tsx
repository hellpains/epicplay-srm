import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { apiFetch } from "../config";

// Курс USDT вписывают вручную; хранится в общих настройках «Стандарт» (как курс ступенями)
export const USDT_KEY = "rates|usdt|rub";
export const USDT_PRICE_KEY = "rate|1";

// Курс USDT в шапке: нажатие открывает поле ввода, Enter или галочка сохраняют
export default function UsdtRate({
  standardPrices = {},
  apiUrl,
  onSaved,
  onEditingChange,
}: {
  standardPrices?: Record<string, Record<string, number>>;
  apiUrl: string;
  onSaved?: () => void;
  // Шапка узкая: пока курс редактируют, соседние кнопки прячутся
  onEditingChange?: (isEditing: boolean) => void;
}) {
  const serverRate = standardPrices[USDT_KEY]?.[USDT_PRICE_KEY] ?? null;
  const [rate, setRate] = useState<number | null>(serverRate);
  useEffect(() => setRate(serverRate), [serverRate]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const setEditing = (value: boolean) => {
    setIsEditing(value);
    onEditingChange?.(value);
  };

  const save = async () => {
    const value = Number(draft.replace(",", "."));
    if (isSaving) return;
    // Пустое или прежнее значение — просто закрываем поле
    if (!(value > 0) || value === rate) {
      setEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({
          action: "updateStandardPrices",
          key: USDT_KEY,
          label: "Курс USDT",
          prices: { [USDT_PRICE_KEY]: value },
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setRate(value);
      setEditing(false);
      onSaved?.();
    } catch {
      // Не сохранилось — поле остаётся открытым
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-neutral-400">USDT</span>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="0"
          className="w-20 h-9 bg-[#121212] border border-green-500/40 rounded-lg px-2 text-[15px] text-white text-right outline-none"
        />
        <button
          onClick={save}
          disabled={isSaving}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#12c83b] text-black active:scale-90 transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(rate ? String(rate).replace(".", ",") : "");
        setEditing(true);
      }}
      className="h-9 px-3 flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/10 active:scale-95 transition-all"
    >
      <span className="text-[12px] font-semibold text-neutral-400">USDT</span>
      <span className="text-[14px] font-bold text-white tabular-nums whitespace-nowrap">
        {rate ? `${rate.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽` : "—"}
      </span>
    </button>
  );
}
