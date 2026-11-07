import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "../config";

// Задание телефону, как его отдаёт сервер: что просили и чем закончилось
type PhoneTask = { id: string; email: string; code: string; status: string; message: string; createdAt: string };

const inputClass =
  "flex-1 min-w-0 h-12 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-[14px] px-4 text-[16px] text-white outline-none transition-colors placeholder:text-neutral-600";

// Пока задание выполняется, спрашиваем итог часто; иначе — изредка, чтобы видеть, на связи ли программа
const BUSY_POLL_MS = 2000;
const IDLE_POLL_MS = 15_000;

const isBusy = (task: PhoneTask | null) => task?.status === "pending" || task?.status === "running";

// Телефон с PS App над сохранёнными аккаунтами: почта — войти в этот аккаунт на телефоне,
// код — ввести его в PS App (настройки → «Отсканировать QR-код» → «Ввести код вручную»).
// Справа от каждого поля — чем закончилось. Задание выполняет программа на компьютере с телефоном
export default function PhoneTasks({ apiUrl }: { apiUrl: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [login, setLogin] = useState<PhoneTask | null>(null);
  const [codeTask, setCodeTask] = useState<PhoneTask | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  // Ошибки отправки: задание не создалось (нет такой почты, нет сети)
  const [loginError, setLoginError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [sending, setSending] = useState("");

  const call = async (body: object) => {
    try {
      const response = await apiFetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ action: "phoneTasks", ...body }),
      });
      return await response.json();
    } catch (e) {
      return { success: false, error: "Ошибка сети" };
    }
  };

  const reload = async () => {
    const result = await call({ op: "status" });
    if (!result.success) return;
    setLogin(result.login ?? null);
    setCodeTask(result.code ?? null);
    setAgentOnline(Boolean(result.agentOnline));
  };

  const busy = isBusy(login) || isBusy(codeTask);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    reloadRef.current();
    const timer = setInterval(() => reloadRef.current(), busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [busy]);

  const digits = code.replace(/\D/g, "");
  const canLogin = sending === "" && !isBusy(login) && email.trim() !== "";
  const canCode = sending === "" && !isBusy(codeTask) && digits.length >= 6;

  const submitLogin = async () => {
    if (!canLogin) return;
    setSending("login");
    const result = await call({ op: "login", email });
    setLoginError(result.success ? "" : String(result.error || "Не удалось отправить"));
    if (result.success) await reload();
    setSending("");
  };

  const submitCode = async () => {
    if (!canCode) return;
    setSending("code");
    const result = await call({ op: "code", code: digits });
    setCodeError(result.success ? "" : String(result.error || "Не удалось отправить"));
    if (result.success) {
      setCode("");
      await reload();
    }
    setSending("");
  };

  // Статус справа от поля: идёт, готово или не вышло
  const status = (task: PhoneTask | null, isSending: boolean) =>
    isSending || isBusy(task) ? (
      <div className="shrink-0 flex items-center gap-1.5 text-[13px] font-semibold text-neutral-400">
        <Loader2 size={14} className="animate-spin" />
        {task?.status === "running" ? "Выполняю" : "Жду телефон"}
      </div>
    ) : task?.status === "done" ? (
      <div className="shrink-0 text-[13px] font-bold text-[#12c83b]">Готово</div>
    ) : task?.status === "error" ? (
      <div className="shrink-0 text-[13px] font-bold text-red-400">Ошибка</div>
    ) : null;

  // Под полем: к чему относится статус и что пошло не так
  const note = (task: PhoneTask | null, sendError: string, subject: string) =>
    sendError ? (
      <div className="px-1 text-[13px] text-red-400">{sendError}</div>
    ) : task?.status === "error" ? (
      <div className="px-1 text-[13px] text-red-400 break-words">
        {subject}: {task.message || "не получилось"}
      </div>
    ) : task && subject ? (
      <div className="px-1 text-[13px] text-neutral-600 break-words">
        {subject}
        {task.status === "done" && task.message && ` — ${task.message}`}
      </div>
    ) : null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[20px] font-bold text-white tracking-tight">Телефон с PS App</div>
        {agentOnline !== null && (
          <div className={`shrink-0 text-[13px] font-semibold ${agentOnline ? "text-[#12c83b]" : "text-amber-400"}`}>
            {agentOnline ? "На связи" : "Программа не запущена"}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <input
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            placeholder="Почта аккаунта — войти на телефоне"
            onChange={(e) => {
              setEmail(e.target.value.slice(0, 200));
              setLoginError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitLogin();
            }}
            className={inputClass}
          />
          {status(login, sending === "login")}
        </div>
        {note(login, loginError, login?.email ?? "")}

        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            placeholder="Код с экрана консоли"
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
              setCodeError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCode();
            }}
            className={`${inputClass} font-mono tracking-widest`}
          />
          {status(codeTask, sending === "code")}
        </div>
        {note(codeTask, codeError, codeTask ? `Код ${codeTask.code}` : "")}

        <div className="px-1 text-[13px] text-neutral-600">Enter в поле отправляет задание на телефон.</div>
      </div>
    </div>
  );
}
