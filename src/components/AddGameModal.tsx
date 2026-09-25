import React, { useState, useRef, useEffect } from "react";
import { apiFetch } from "../config";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Check } from "lucide-react";

function ResultDialog({
  type,
  message,
  onOk,
}: {
  type: "success" | "error";
  message: string;
  onOk: () => void;
}) {
  const isSuccess = type === "success";
  const Icon = isSuccess ? Check : X;
  const iconBg = isSuccess ? "bg-[#12c83b]" : "bg-[#ff3b30]";

  const formatMessage = (msg: string) => {
    if (msg.includes("уже добавлена")) {
      const noun = msg.split(" ")[0];
      return (
        <>
          {noun} уже <br /> добавлена!
        </>
      );
    }
    if (msg.includes("успешно добавлена")) {
      const noun = msg.split(" ")[0];
      return (
        <>
          {noun} успешно <br /> добавлена!
        </>
      );
    }
    return msg;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/45 backdrop-blur-[4px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        
        className="w-full max-w-[180px] bg-[#1c1c1e]/75 backdrop-blur-2xl border border-white/10 rounded-[30px] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex flex-col items-center px-4 pt-7 pb-5">
          
          <div
            className={`w-[50px] h-[50px] rounded-full flex items-center justify-center shrink-0 ${iconBg} mb-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]`}
          >
            <Icon size={30} strokeWidth={3.5} className="text-white" />
          </div>

          <p className="text-[16px] font-medium text-white text-center leading-[1.3] tracking-tight">
            {formatMessage(message)}
          </p>
        </div>

        <div className="border-t border-white/5 bg-white/[0.05]">
          <button
            onClick={onOk}
            className="w-full text-[17px] text-blue-400 font-semibold py-2.5 active:bg-white/10 transition-colors"
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AddGameModal({
  onClose,
  onAddGame,
  API_URL,
  existingGames = [],
  kind = "игры",
}: any) {
  const isSub = kind === "подписки";
  const noun = isSub ? "Подписка" : "Игра";
  const [title, setTitle] = useState("");
  const [editions, setEditions] = useState(["Standard"]);
  const [platforms, setPlatforms] = useState({ ps5: false, ps4: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toastStatus, setToastStatus] = useState<null | {
    type: "success" | "error";
    message: string;
    onOk: () => void;
  }>(null);

  const [shouldFocus, setShouldFocus] = useState(false);
  const lastInputRef = useRef<HTMLInputElement>(null);

  const handleAddEdition = () => {
    if (editions.length < 5) {
      setEditions([...editions, ""]);
      setShouldFocus(true);
    }
  };

  const handleRemoveEdition = (indexToRemove: number) => {
    setEditions(editions.filter((_, index) => index !== indexToRemove));
  };

  const handleEditionChange = (text: string, index: number) => {
    const newEditions = [...editions];
    newEditions[index] = text;
    setEditions(newEditions);
  };

  const togglePlatform = (platform: "ps5" | "ps4") => {
    setPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return alert("Введите название");

    const isDuplicate = existingGames.some(
      (game: any) =>
        game.name.toLowerCase() === trimmedTitle.toLowerCase() &&
        (game.type ? game.type === kind : true)
    );

    if (isDuplicate) {

      setToastStatus({
        type: "error",
        message: `${noun} уже добавлена!`,
        onOk: () => setToastStatus(null),
      });
      return;
    }

    
    if (!platforms.ps5 && !platforms.ps4)
      return alert("Выберите хотя бы одну платформу");

    const validEditions = editions.filter((ed) => ed.trim() !== "");
    if (validEditions.length === 0)
      return alert("Добавьте хотя бы одно издание");

    setIsSubmitting(true);

    try {
      await apiFetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addGame",
          type: kind,
          name: trimmedTitle,
          editions: validEditions,
          hasPS5: platforms.ps5,
          hasPS4: platforms.ps4,
        }),
      });



      setToastStatus({
        type: "success",
        message: `${noun} успешно добавлена!`,
        onOk: () => {
          setToastStatus(null);
          if (onAddGame) onAddGame();
          onClose(); 
        },
      });
    } catch (error) {
      console.error("Ошибка:", error);
      
      setToastStatus({
        type: "error",
        message: "Ошибка при отправке",
        onOk: () => {
          setToastStatus(null);
          setIsSubmitting(false); 
        },
      });
    }
  };

  useEffect(() => {
    if (shouldFocus && lastInputRef.current) {
      lastInputRef.current.focus();
      setShouldFocus(false);
    }
  }, [editions.length, shouldFocus]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[28px] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-[18px] font-medium text-white">
            {isSub ? "Добавить подписку" : "Добавить игру"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[13px] text-neutral-400 pl-1">
              {isSub ? "Название" : "Название игры"}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] text-neutral-400 pl-1">Издания</label>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {editions.map((edition, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={index === editions.length - 1 ? lastInputRef : null}
                      type="text"
                      value={edition}
                      onChange={(e) =>
                        handleEditionChange(e.target.value, index)
                      }
                      className="flex-1 bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors"
                    />
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEdition(index)}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 shrink-0 active:scale-90 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {editions.length < 5 && (
              <button
                type="button"
                onClick={handleAddEdition}
                className="flex items-center gap-1.5 text-green-500 text-[13px] font-medium mt-2 pl-1 active:opacity-70 transition-opacity"
              >
                <Plus size={16} />
                добавить издание
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] text-neutral-400 pl-1">
              Платформы
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => togglePlatform("ps5")}
                className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 border ${
                  platforms.ps5
                    ? "border-green-500 text-green-400 bg-green-500/5"
                    : "border-white/5 text-neutral-500 bg-[#1a1a1a]"
                }`}
              >
                PS5
              </button>
              <button
                type="button"
                onClick={() => togglePlatform("ps4")}
                className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 border ${
                  platforms.ps4
                    ? "border-green-500 text-green-400 bg-green-500/5"
                    : "border-white/5 text-neutral-500 bg-[#1a1a1a]"
                }`}
              >
                PS4
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#12c83b] text-black text-[15px] font-medium rounded-xl active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Отправка..." : "Добавить"}
            </button>
          </div>
        </form>
      </motion.div>

      <AnimatePresence>
        {toastStatus && (
          <ResultDialog
            type={toastStatus.type}
            message={toastStatus.message}
            onOk={toastStatus.onOk}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
