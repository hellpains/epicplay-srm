import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, ChevronLeft, Send, Loader2, RotateCw } from "lucide-react";
import { API_URL, apiFetch } from "./config";

type AvitoChat = {
  id: string;
  name: string;
  avatar: string;
  itemTitle: string;
  itemPrice: string;
  itemImage: string;
  itemUrl: string;
  lastText: string;
  lastDirection: string;
  updated: number;
  unread: boolean;
};

type AvitoMessage = {
  id: string;
  direction: "in" | "out";
  type: string;
  text: string;
  image: string;
  created: number;
  isRead: boolean;
};

// Новые сообщения приходят веб-хуком: раз в несколько секунд смотрим в нашей базе последнее событие
// и по нему обновляем чаты. Опрос самого Авито — запасной, на случай если уведомление не дошло
const EVENTS_CHECK_MS = 3_000;
const CHATS_REFRESH_MS = 60_000;
const MESSAGES_REFRESH_MS = 30_000;

async function post(body: object) {
  const response = await apiFetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  return response.json();
}

// Время последнего сообщения: сегодня — часы, иначе дата
function chatTime(seconds: number) {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function messageTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(seconds: number) {
  const d = new Date(seconds * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function Avatar({ chat, size = 48 }: { chat: Pick<AvitoChat, "avatar" | "name">; size?: number }) {
  return chat.avatar ? (
    <img
      src={chat.avatar}
      alt=""
      className="rounded-full object-cover shrink-0 bg-white/5"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full shrink-0 bg-white/10 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {chat.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ChatView({
  chat,
  refreshSignal,
  onBack,
  onSent,
}: {
  chat: AvitoChat;
  // Меняется, когда веб-хук сообщил о новом сообщении в этом чате
  refreshSignal: number;
  onBack: () => void;
  onSent: () => void;
}) {
  const [messages, setMessages] = useState<AvitoMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Поле растёт вместе с текстом (до max-h), после отправки возвращается к одной строке
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Перенос строки в месте курсора
  const insertNewLine = () => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + "\n" + draft.slice(end));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1;
    });
  };

  const load = async () => {
    try {
      const result = await post({ action: "avitoMessages", chatId: chat.id });
      if (!result.success) throw new Error(result.error || "Не удалось загрузить переписку");
      setMessages(result.messages);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, MESSAGES_REFRESH_MS);
    return () => clearInterval(timer);
  }, [chat.id]);

  useEffect(() => {
    if (refreshSignal) load();
  }, [refreshSignal]);

  // Прокрутка вниз, когда появляются новые сообщения
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: lastCountRef.current ? "smooth" : "auto" });
      lastCountRef.current = messages.length;
    }
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const result = await post({ action: "avitoSend", chatId: chat.id, text });
      if (!result.success) throw new Error(result.error || "Не удалось отправить");
      setMessages((list) => [...list, result.message]);
      setDraft("");
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", damping: 30, stiffness: 320 }}
      className="fixed inset-0 z-[60] max-w-md mx-auto flex flex-col h-[100dvh] bg-[#0f0f10]"
    >
      <div
        className="shrink-0 flex items-center gap-3 px-4 pb-3 bg-[#1a1a1c] border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 12px)" }}
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="h-10 w-10 rounded-full bg-white/[0.06] border border-white/10 text-white flex items-center justify-center shrink-0"
        >
          <ChevronLeft size={20} />
        </motion.button>
        <Avatar chat={chat} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-white truncate">{chat.name}</div>
          {chat.itemTitle && (
            <div className="text-[12px] text-neutral-500 truncate">
              {chat.itemTitle}
              {chat.itemPrice ? ` · ${chat.itemPrice}` : ""}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1.5" style={{ scrollbarWidth: "none" }}>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-neutral-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[14px] text-neutral-600">Сообщений пока нет</div>
        ) : (
          messages.map((m, i) => {
            const isOut = m.direction === "out";
            const showDay = i === 0 || dayLabel(messages[i - 1].created) !== dayLabel(m.created);
            return (
              <div key={m.id} className="flex flex-col">
                {showDay && (
                  <div className="self-center my-2 px-3 py-1 rounded-full bg-white/[0.06] text-[11px] text-neutral-400">
                    {dayLabel(m.created)}
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-[18px] px-3.5 py-2 ${
                    isOut
                      ? "self-end bg-[#12c83b] text-black rounded-br-md"
                      : "self-start bg-[#1f1f22] text-white rounded-bl-md"
                  }`}
                >
                  {m.image ? (
                    <a href={m.image} target="_blank" rel="noreferrer">
                      <img src={m.image} alt="" className="rounded-xl max-h-64 object-cover" />
                    </a>
                  ) : (
                    <div className="text-[15px] leading-snug whitespace-pre-wrap break-words">{m.text}</div>
                  )}
                  <div className={`mt-0.5 text-right text-[10px] ${isOut ? "text-black/50" : "text-neutral-500"}`}>
                    {messageTime(m.created)}
                    {isOut ? (m.isRead ? " · прочитано" : "") : ""}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="shrink-0 px-4 pb-2 text-[13px] text-red-400">{error}</div>}

      <div
        className="shrink-0 flex items-end gap-2 px-3 pt-2 bg-[#1a1a1c] border-t border-white/5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          ref={inputRef}
          // Enter — отправить; Alt+Enter или Shift+Enter — новая строка
          // (во время набора через подсказки клавиатуры Enter не отправляет)
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (e.altKey || e.shiftKey) insertNewLine();
            else send();
          }}
          enterKeyHint="send"
          placeholder="Сообщение"
          rows={1}
          className="flex-1 max-h-32 overflow-y-auto resize-none bg-white/[0.06] border border-white/10 rounded-[20px] px-4 py-2.5 text-[15px] text-white outline-none focus:border-[#12c83b]/50 placeholder:text-neutral-600"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={send}
          disabled={!draft.trim() || isSending}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="h-11 w-11 rounded-full bg-[#12c83b] text-black flex items-center justify-center shrink-0 disabled:opacity-40"
        >
          {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </motion.button>
      </div>
    </motion.div>
  );
}

// Раздел «Авито»: чаты с покупателями
export default function AvitoChatScreen() {
  const [chats, setChats] = useState<AvitoChat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [openChat, setOpenChat] = useState<AvitoChat | null>(null);
  const [openChatSignal, setOpenChatSignal] = useState(0);
  const lastEventRef = useRef<number | null>(null);
  const openChatIdRef = useRef<string | null>(null);
  openChatIdRef.current = openChat?.id ?? null;

  const loadChats = async () => {
    setIsRefreshing(true);
    try {
      const result = await post({ action: "avitoChats" });
      if (!result.success) throw new Error(result.error || "Не удалось загрузить чаты");
      setChats(result.chats);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadChats();
    const timer = setInterval(loadChats, CHATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Следим за событиями веб-хука: новое событие — сразу обновляем список и открытую переписку
  useEffect(() => {
    const check = async () => {
      try {
        const result = await post({ action: "avitoEvents" });
        if (!result.success) return;
        const previous = lastEventRef.current;
        lastEventRef.current = result.lastId;
        if (previous === null || result.lastId === previous) return;
        loadChats();
        // Открытую переписку обновляем при любом новом событии: за раз могли прийти сообщения в разные чаты
        if (openChatIdRef.current) setOpenChatSignal((n) => n + 1);
      } catch {
        // Нет связи — попробуем в следующий раз
      }
    };
    check();
    const timer = setInterval(check, EVENTS_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const unreadCount = chats.filter((c) => c.unread).length;

  return (
    <div
      className="min-h-[100dvh] px-5 pb-40"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 24px) + 1.25rem)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[26px] font-bold text-white tracking-tight">Авито</h1>
          {unreadCount > 0 && <span className="text-[14px] font-semibold text-[#12c83b]">{unreadCount} новых</span>}
        </div>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={loadChats}
          disabled={isRefreshing}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="h-10 w-10 rounded-full bg-white/[0.06] border border-white/10 text-neutral-400 flex items-center justify-center"
        >
          <RotateCw size={17} className={isRefreshing ? "animate-spin text-[#12c83b]" : ""} />
        </motion.button>
      </div>

      {error && (
        <div className="mb-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={26} className="animate-spin text-neutral-500" />
        </div>
      ) : chats.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
          <MessageCircle size={40} className="text-neutral-600" />
          <div className="text-[14px]">Чатов пока нет</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chats.map((chat) => (
            <motion.button
              key={chat.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setOpenChat(chat);
                // Открытый чат становится прочитанным
                setChats((list) => list.map((c) => (c.id === chat.id ? { ...c, unread: false } : c)));
              }}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[20px] border text-left ${
                chat.unread ? "bg-[#12c83b]/[0.06] border-[#12c83b]/20" : "bg-white/[0.03] border-white/5"
              }`}
            >
              <Avatar chat={chat} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[15px] truncate ${chat.unread ? "font-bold text-white" : "font-semibold text-white"}`}>
                    {chat.name}
                  </span>
                  <span className={`text-[12px] shrink-0 ${chat.unread ? "text-[#12c83b]" : "text-neutral-500"}`}>
                    {chatTime(chat.updated)}
                  </span>
                </div>
                {chat.itemTitle && <div className="text-[12px] text-neutral-500 truncate">{chat.itemTitle}</div>}
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[13px] truncate ${chat.unread ? "text-white" : "text-neutral-400"}`}>
                    {chat.lastDirection === "out" ? "Вы: " : ""}
                    {chat.lastText}
                  </span>
                  {chat.unread && <span className="w-2.5 h-2.5 rounded-full bg-[#12c83b] shrink-0" />}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {openChat && (
          <ChatView
            key={openChat.id}
            chat={openChat}
            refreshSignal={openChatSignal}
            onBack={() => {
              setOpenChat(null);
              loadChats();
            }}
            onSent={loadChats}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
