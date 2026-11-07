import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "../config";

type GptAccount = { id: string; email: string; password: string; totp: string; createdAt: string };

// Код входа из ключа 2FA (TOTP, RFC 6238: SHA-1, 30 секунд, 6 цифр) — тот же, что показывает
// приложение-аутентификатор. Пустая строка, если ключ не похож на настоящий
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_S = 30;

async function totpCode(key: string, step: number) {
  const clean = key.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length < 16 || [...clean].some((char) => !BASE32.includes(char))) return "";
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = ((value << 5) | BASE32.indexOf(char)) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setUint32(4, step);
  try {
    const hmacKey = await crypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, counter));
    const offset = hash[hash.length - 1] & 0x0f;
    const number = new DataView(hash.buffer).getUint32(offset) & 0x7fffffff;
    return String(number % 1_000_000).padStart(6, "0");
  } catch (e) {
    return "";
  }
}

const inputClass =
  "h-12 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-[14px] px-4 text-[16px] text-white outline-none transition-colors placeholder:text-neutral-600";

// Сохранённые аккаунты ChatGPT в разделе админа «Долги партнёров»: форма из почты, пароля и ключа 2FA
// и под ней список сохранённого. Нажатие на почту, пароль или ключ копирует значение
export default function GptAccounts({ apiUrl }: { apiUrl: string }) {
  const [accounts, setAccounts] = useState<GptAccount[] | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Удаление: первое нажатие на корзину просит подтвердить, второе удаляет
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [removingId, setRemovingId] = useState("");
  // Что только что скопировали («<аккаунт>:<поле>») — на мгновение зеленеет
  const [copied, setCopied] = useState("");

  const call = async (body: object) => {
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "gptAccounts", ...body }),
      });
      return await response.json();
    } catch (e) {
      return { success: false, error: "Ошибка сети" };
    }
  };

  const reload = async () => {
    const result = await call({ op: "list" });
    if (!result.success) {
      setError(String(result.error || "Не удалось загрузить аккаунты"));
      return;
    }
    setAccounts(result.accounts ?? []);
  };

  useEffect(() => {
    reload();
  }, []);

  // Коды 2FA по аккаунтам на текущие 30 секунд; пересчитываются, когда наступают следующие
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [step, setStep] = useState(() => Math.floor(Date.now() / 1000 / TOTP_STEP_S));
  useEffect(() => {
    const timer = setInterval(() => setStep(Math.floor(Date.now() / 1000 / TOTP_STEP_S)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let isCurrent = true;
    Promise.all((accounts ?? []).map(async (account) => [account.id, await totpCode(account.totp, step)] as const)).then(
      (pairs) => {
        if (isCurrent) setCodes(Object.fromEntries(pairs));
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [accounts, step]);

  const canSave =!isSaving && email.trim() !== "" && password.trim() !== "";

  const submit = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const result = await call({ op: "add", email, password, totp });
    if (result.success) {
      setEmail("");
      setPassword("");
      setTotp("");
      setError("");
      await reload();
    } else {
      setError(String(result.error || "Не удалось сохранить"));
    }
    setIsSaving(false);
  };

  const remove = async (id: string) => {
    if (removingId) return;
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      return;
    }
    setRemovingId(id);
    const result = await call({ op: "remove", id });
    if (result.success) {
      setError("");
      await reload();
    } else {
      setError(String(result.error || "Не удалось удалить"));
    }
    setConfirmRemoveId("");
    setRemovingId("");
  };

  const copy = async (mark: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mark);
      setTimeout(() => setCopied((current) => (current === mark ? "" : current)), 1500);
    } catch (e) {
      // Буфер обмена недоступен — значение остаётся на странице, его можно выделить руками
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  // Строка аккаунта: подпись слева, значение и значок копирования; нажатие копирует значение
  const row = (account: GptAccount, field: string, label: string, value: string) => {
    const mark = `${account.id}:${field}`;
    return (
      <div className="flex items-baseline gap-3 min-w-0">
        <div className="shrink-0 w-[68px] text-[13px] font-semibold text-neutral-500">{label}</div>
        <button
          onClick={() => copy(mark, value)}
          title="Скопировать"
          className={`min-w-0 flex items-center gap-2.5 text-left font-mono text-[15px] font-bold transition-colors ${
            copied === mark ? "text-[#12c83b]" : "text-white"
          }`}
        >
          <span className="min-w-0 break-all">{value}</span>
          {copied === mark ? (
            <Check size={14} className="shrink-0" />
          ) : (
            <Copy size={14} className="shrink-0 text-neutral-500" />
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="mt-8 pb-10">
      <div className="text-[20px] font-bold text-white tracking-tight">Сохранённые аккаунты</div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={email}
          placeholder="Почта"
          disabled={isSaving}
          onChange={(e) => setEmail(e.target.value.slice(0, 200))}
          onKeyDown={onEnter}
          className={inputClass}
        />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={password}
          placeholder="Пароль"
          disabled={isSaving}
          onChange={(e) => setPassword(e.target.value.slice(0, 200))}
          onKeyDown={onEnter}
          className={inputClass}
        />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={totp}
          placeholder="Ключ 2FA (необязательно)"
          disabled={isSaving}
          onChange={(e) => setTotp(e.target.value.slice(0, 200))}
          onKeyDown={onEnter}
          className={inputClass}
        />
        <button
          onClick={submit}
          disabled={!canSave}
          className="h-12 rounded-[14px] bg-[#12c83b] text-black text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
        >
          {isSaving && <Loader2 size={16} className="animate-spin" />}
          Сохранить
        </button>
        {error && <div className="px-1 text-[13px] text-red-400">{error}</div>}
      </div>

      {accounts === null ? (
        !error && (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        )
      ) : accounts.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-neutral-600">Сохранённых аккаунтов пока нет</div>
      ) : (
        <div className="mt-4 flex flex-col gap-1.5">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="px-4 py-3 rounded-[16px] bg-white/[0.04] border border-white/5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex flex-col gap-2">
                {row(account, "email", "Почта", account.email)}
                {row(account, "password", "Пароль", account.password)}
                {/* Код на эти 30 секунд; ключ не похож на настоящий — показываем его как есть */}
                {account.totp && row(account, "totp", "Код 2FA", codes[account.id] || account.totp)}
              </div>
              <button
                onClick={() => remove(account.id)}
                disabled={removingId !== ""}
                className={`shrink-0 h-9 rounded-[12px] border flex items-center justify-center text-[13px] font-semibold active:scale-90 transition-all disabled:opacity-40 ${
                  confirmRemoveId === account.id
                    ? "px-3 bg-red-500/15 border-red-500/30 text-red-400"
                    : "w-9 bg-white/5 border-white/10 text-neutral-400"
                }`}
              >
                {removingId === account.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : confirmRemoveId === account.id ? (
                  "Удалить?"
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
