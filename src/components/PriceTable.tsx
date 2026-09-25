import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Pencil } from "lucide-react";
import { apiFetch } from "../config";

const SLOTS = ["П2", "П3"];

type Row = { edition: string; platform: string };

const priceKey = (edition: string, platform: string, slot: string) =>
  `${edition}|${platform}|${slot}`;

function editionTitle(edition: string) {
  return /edition$/i.test(edition.trim()) ? edition.trim() : `${edition.trim()} Edition`;
}

// Текст для клиента: блок на каждое издание+платформу, только заданные цены
export function buildPriceText(rows: Row[], slots: string[], prices: Record<string, number>) {
  return rows
    .map(({ edition, platform }) => {
      const lines = slots
        .filter((slot) => prices[priceKey(edition, platform, slot)])
        .map((slot) => `✔️ ${prices[priceKey(edition, platform, slot)]}₽ — ${slot}`);
      return lines.length ? `${platform} ${editionTitle(edition)}:\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// Кнопка-«пилюля»: копирует свой текст и на секунду подсвечивается
function CopyCell({ text, copied, onCopy, className, children }: any) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onTap={onCopy}
      disabled={!text}
      style={{ WebkitTapHighlightColor: "transparent" }}
      className={`cursor-pointer touch-manipulation select-none h-11 rounded-[18px] border flex items-center justify-center text-[14px] font-bold transition-colors ${
        copied
          ? "bg-[#12c83b]/20 border-[#12c83b]/40 text-[#12c83b]"
          : "bg-white/5 border-white/10 text-white"
      } ${text ? "" : "opacity-40"} ${className ?? ""}`}
    >
      {copied ? <Check size={16} /> : children}
    </motion.button>
  );
}

export default function PriceTable({ item, API_URL, onSaved }: any) {
  const [prices, setPrices] = useState<Record<string, number>>(item.prices ?? {});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimeout = useRef<any>(null);

  useEffect(() => {
    if (!isEditing) setPrices(item.prices ?? {});
  }, [item.prices, isEditing]);

  // Порядок как в прайсе: по изданиям, внутри — PS4, затем PS5
  const platforms = [item.hasPS4 !== false && "PS4", item.hasPS5 !== false && "PS5"].filter(
    Boolean
  ) as string[];
  const rows: Row[] = (item.editions ?? []).flatMap((edition: string) =>
    platforms.map((platform) => ({ edition, platform }))
  );

  const copy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(null), 1000);
  };

  const startEditing = () => {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(prices)) values[key] = String(value);
    setDraft(values);
    setError("");
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updatePrices",
          id: item.id,
          prices: draft,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setPrices(result.prices);
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

  const allText = buildPriceText(rows, SLOTS, prices);
  const cell = (id: string, text: string) => ({
    text,
    copied: copied === id,
    onCopy: () => copy(id, text),
  });

  const priceCell = (edition: string, platform: string, slot: string) => {
    const key = priceKey(edition, platform, slot);
    if (isEditing) {
      return (
        <input
          key={key}
          inputMode="numeric"
          placeholder="—"
          value={draft[key] ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, [key]: e.target.value.replace(/[^\d]/g, "") }))
          }
          className="h-11 w-full min-w-0 rounded-[18px] bg-[#1c1c1e] border border-white/15 text-center text-[16px] font-bold text-white outline-none focus:border-[#12c83b]/50"
        />
      );
    }
    const price = prices[key];
    return (
      <button
        key={key}
        onClick={() => copy(key, buildPriceText([{ edition, platform }], [slot], prices))}
        disabled={!price}
        style={{ WebkitTapHighlightColor: "transparent" }}
        className={`h-11 rounded-[18px] text-[14px] font-bold transition-colors ${
          copied === key ? "text-[#12c83b]" : price ? "text-white" : "text-neutral-600"
        }`}
      >
        {price ? `${price}₽` : "—"}
      </button>
    );
  };

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-[26px] border border-white/10 p-2">
      <div className="grid grid-cols-[1fr_76px_76px] gap-1.5">
        <CopyCell {...cell("all", allText)} className="text-neutral-400 font-semibold gap-2">
          <Copy size={15} /> Весь прайс
        </CopyCell>
        {SLOTS.map((slot) => (
          <CopyCell key={slot} {...cell(`col-${slot}`, buildPriceText(rows, [slot], prices))}>
            {slot}
          </CopyCell>
        ))}

        {rows.map(({ edition, platform }) => {
          const rowId = `${edition}|${platform}`;
          return [
            <CopyCell
              key={rowId}
              {...cell(rowId, buildPriceText([{ edition, platform }], SLOTS, prices))}
              className="px-3"
            >
              <span className="truncate">
                {edition} {platform}
              </span>
            </CopyCell>,
            ...SLOTS.map((slot) => priceCell(edition, platform, slot)),
          ];
        })}
      </div>

      {error && <div className="text-red-500 text-xs text-center mt-2">{error}</div>}

      <div className="flex gap-1.5 mt-1.5">
        {isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="flex-1 h-10 rounded-[16px] bg-white/5 border border-white/10 text-[13px] font-semibold text-neutral-300 active:scale-95 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="flex-1 h-10 rounded-[16px] bg-[#12c83b] text-black text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
          </>
        ) : (
          <button
            onClick={startEditing}
            className="flex-1 h-9 rounded-[16px] text-[12px] font-semibold text-neutral-500 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Pencil size={12} /> {allText ? "Изменить цены" : "Цены не заданы — указать"}
          </button>
        )}
      </div>
    </div>
  );
}
