import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Type, Copy, Check, Eraser, KeyRound, ShieldCheck, LogIn } from "lucide-react";

const DIVIDER = "————————————";

type AccountField = "email" | "password" | "mailPassword" | "birthDate" | "backupCodes" | "authKey";

// Порядок важен: «Почта пароль» и «2ФА резервные коды» должны определяться раньше, чем «Почта» и «2ФА»
function fieldByLabel(label: string): AccountField | null {
  const l = label.toLowerCase();
  if (l.includes("резерв")) return "backupCodes";
  if (/2фа|2fa|google|authenticator/.test(l)) return "authKey";
  if (l.includes("почт") && l.includes("парол")) return "mailPassword";
  if (l.includes("почт")) return "email";
  if (l.includes("парол")) return "password";
  if (l.includes("рожд")) return "birthDate";
  return null;
}

type AccountFields = Partial<Record<AccountField, string>>;

function parseFields(text: string): AccountFields {
  const fields: AccountFields = {};
  for (const line of text.split(/\r\n?|\n/)) {
    // Делим по первому двоеточию: в пароле могут быть свои
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = fieldByLabel(line.slice(0, colon));
    const value = line.slice(colon + 1).trim();
    if (field && value && !fields[field]) fields[field] = value;
  }
  return fields;
}

function backupCodes(fields: AccountFields): string[] {
  return (fields.backupCodes ?? "").split(/[\s,;]+/).filter(Boolean);
}

// Данные аккаунта PlayStation от поставщика → сообщение для клиента
export function formatText(text: string): string {
  const fields = parseFields(text);
  if (Object.keys(fields).length === 0) return text.trim();

  return [
    `Почта: ${fields.email ?? ""}`,
    `Пароль от аккаунта: ${fields.password ?? ""}`,
    ...(fields.mailPassword ? [`Пароль от почты: ${fields.mailPassword}`] : []),
    `Дата рождения: ${fields.birthDate ?? ""}`,
    DIVIDER,
    "Резервные коды",
    "для входа в аккаунт:",
    ...backupCodes(fields),
    DIVIDER,
    "Ключ для доступа к 2ф в приложении Google Authenticator:",
    "",
    fields.authKey ?? "",
  ].join("\n");
}

// Данные для входа: почта, пароль и первый резервный код
export function loginText(text: string): string {
  const fields = parseFields(text);
  if (Object.keys(fields).length === 0) return "";

  return [
    "Для входа в аккаунт достаточно следующих данных, вводите почту и пароль, далее резервный код",
    "——————————————————",
    `Почта: ${fields.email ?? ""}`,
    `Пароль от аккаунта: ${fields.password ?? ""}`,
    `Резервный код: ${backupCodes(fields)[0] ?? ""}`,
  ].join("\n");
}

// Все резервные коды с пояснением для клиента
export function backupCodesText(text: string): string {
  const codes = backupCodes(parseFields(text));
  if (codes.length === 0) return "";

  return [
    "Вот ваши резервные коды, они нужны для входа в аккаунт",
    "После ввода почты и пароля требуют резервный код",
    "—————",
    ...codes,
  ].join("\n");
}

// Ключ 2ФА с инструкцией для клиента
export function authKeyText(text: string): string {
  const { authKey } = parseFields(text);
  if (!authKey) return "";

  return [
    "Скачайте приложение Google Authenticator и вставьте туда этот ключ. У вас будут бесконечные коды, которые обновляются каждые 30 секунд",
    DIVIDER,
    authKey,
  ].join("\n");
}

type CopyKey = "result" | "login" | "codes" | "authKey";

const fieldClass =
  "hide-scrollbar min-h-0 w-full resize-none bg-white/[0.04] border border-white/10 rounded-[18px] px-5 py-4 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600";

export function TextFormatModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const result = text.trim() ? formatText(text) : "";
  const copyButtons = [
    { key: "login", label: "Для входа", Icon: LogIn, value: loginText(text) },
    { key: "codes", label: "Коды", Icon: ShieldCheck, value: backupCodesText(text) },
    { key: "authKey", label: "Ключ 2ФА", Icon: KeyRound, value: authKeyText(text) },
  ] as const;

  const copy = (key: CopyKey, value: string) => {
    if (!value) return;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    navigator.clipboard.writeText(value);
    setCopied(key);
    copyTimeoutRef.current = setTimeout(() => setCopied(null), 1000);
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
        <div className="w-12 h-12 rounded-full border border-white/10 bg-white/[0.06] text-white flex items-center justify-center shrink-0">
          <Type size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-neutral-500 font-medium">Текст</div>
          <div className="text-[22px] font-bold text-white leading-tight truncate">Форматирование</div>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setText("")}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="h-12 w-12 rounded-full border border-white/10 bg-white/[0.06] text-white flex items-center justify-center shrink-0"
        >
          <Eraser size={20} />
        </motion.button>
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
        className="flex-1 min-h-0 flex flex-col gap-3 px-5 pt-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {/* Полосы прокрутки прячем: в Chrome/Safari — через стиль, в Firefox — через scrollbarWidth */}
        <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        <textarea
          autoFocus
          className={`${fieldClass} flex-[3] focus:border-[#12c83b]/50`}
          style={{ scrollbarWidth: "none" }}
          placeholder="Вставьте текст"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="relative flex-[7] min-h-0 flex flex-col">
          <textarea
            readOnly
            className={`${fieldClass} flex-1 pb-16`}
            style={{ scrollbarWidth: "none" }}
            placeholder="Здесь появится результат"
            value={result}
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => copy("result", result)}
            disabled={!result}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="absolute right-3 bottom-3 h-10 w-10 rounded-full bg-[#12c83b] text-black flex items-center justify-center disabled:opacity-40"
          >
            {copied === "result" ? <Check size={16} /> : <Copy size={16} />}
          </motion.button>
        </div>
        <div className="shrink-0 h-12 flex gap-2">
          {copyButtons.map(({ key, label, Icon, value }) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.95 }}
              onClick={() => copy(key, value)}
              disabled={!value}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className="flex-1 min-w-0 h-12 rounded-full border border-white/10 bg-white/[0.06] text-white text-[13px] whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {copied === key ? <Check size={16} className="text-[#12c83b]" /> : <Icon size={16} />}
              {copied === key ? "Скопировано" : label}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
