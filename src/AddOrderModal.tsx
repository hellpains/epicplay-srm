import React, { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "./config";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ChevronDown } from "lucide-react";

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
    if (msg.includes("успешно добавлен")) {
      return (
        <>
          Заказ успешно <br /> добавлен!
        </>
      );
    }
    if (msg.includes("аккаунт добавлен")) {
      return (
        <>
          Аккаунт успешно <br /> добавлен!
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

export default function AddOrderModal({
  onClose,
  gamesList = [],
  variables = { employees: [], paymentMethods: [], currencies: [] },
  fetchItems,
  API_URL,
}: any) {
  const EMPLOYEES = variables.employees?.length
    ? variables.employees
    : ["Сотрудник"];
  const PAYMENT_METHODS = variables.paymentMethods?.length
    ? variables.paymentMethods
    : ["Метод"];
  const CURRENCIES = variables.currencies?.length
    ? variables.currencies
    : ["Валюта"];

  const [orderType, setOrderType] = useState("Шеринг");

  const [employee, setEmployee] = useState(
    localStorage.getItem("last_employee") || EMPLOYEES[0]
  );
  const [client, setClient] = useState("");
  const [login, setLogin] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  const [selectedEdition, setSelectedEdition] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [replacementSlot, setReplacementSlot] = useState("");

  const [price, setPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [expenseValue, setExpenseValue] = useState("");
  const [currency, setCurrency] = useState(CURRENCIES[0]);

  const [useManualDate, setUseManualDate] = useState(false);
  const [manualDate, setManualDate] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showZeroPriceModal, setShowZeroPriceModal] = useState(false);

  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [toastStatus, setToastStatus] = useState<null | {
    type: "success" | "error";
    message: string;
    onOk: () => void;
  }>(null);

  const getBgClass = (val: string, isAuto = false) => {
    if (isAuto) return "bg-[#1a1a1a]/40 opacity-70";
    return val.trim() ? "bg-[#1a1a1a]" : "bg-[#262626]";
  };

  const getCurrentDateTimeLocal = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset)
      .toISOString()
      .slice(0, 16);
    return localISOTime;
  };

  useEffect(() => {
    const handleFocusOut = () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "SELECT" ||
            activeEl.tagName === "TEXTAREA")
        ) {
          return;
        }
        window.scrollTo(0, 0);
      }, 100);
    };

    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  }, []);

  useEffect(() => {
    if (PAYMENT_METHODS.length && (!paymentMethod || paymentMethod === "Метод"))
      setPaymentMethod(PAYMENT_METHODS[0]);
    if (CURRENCIES.length && (!currency || currency === "Валюта"))
      setCurrency(CURRENCIES[0]);
  }, [variables]);

  useEffect(() => {
    if (employee && employee !== "Сотрудник") {
      localStorage.setItem("last_employee", employee);
    }
  }, [employee]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getSlotsForGame = (game: any) => {
    if (!game) return [];
    if (game.hasPS5 && game.hasPS4) {
      return ["PS5 П3", "PS5 П3", "PS5 П2", "PS4 П3", "PS4 П2"];
    }
    return ["П3", "П3", "П2"];
  };

  const availableSlots = useMemo(() => {
    const baseSlots = Array.from(new Set(getSlotsForGame(selectedGame)));
    if (isAutoFilled && baseSlots.length > 0) {
      return [...baseSlots, "Возврат"];
    }
    return baseSlots;
  }, [selectedGame, isAutoFilled]);

  const replacementOptions = useMemo(() => {
    const baseSlots = Array.from(new Set(getSlotsForGame(selectedGame)));
    return baseSlots.map((s) => `Возврат ${s}`);
  }, [selectedGame]);

  useEffect(() => {
    const searchEmail = login.trim().toLowerCase();
    if (!searchEmail) {
      setIsAutoFilled(false);
      setSelectedSlot("");
      return;
    }

    let found = false;
    for (const game of gamesList) {
      if (game.accountDetails) {
        for (const ed in game.accountDetails) {
          for (const acc of game.accountDetails[ed]) {
            if (acc.email.toLowerCase() === searchEmail) {
              setSelectedGame(game);
              setSearchQuery(game.name);
              setSelectedEdition(ed);
              setIsAutoFilled(true);
              setSelectedSlot("");
              setErrors((prev) => ({ ...prev, game: false, edition: false }));
              found = true;
              break;
            }
          }
        }
      }
      if (found) break;
    }
    if (!found && isAutoFilled) {
      setIsAutoFilled(false);
      setSelectedSlot("");
    }
  }, [login, gamesList]);

  const filteredGames = useMemo(() => {
    if (!searchQuery.trim() || isAutoFilled) return [];
    return gamesList.filter((game: any) =>
      game.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, gamesList, isAutoFilled]);

  const handleSelectGame = (game: any) => {
    setSelectedGame(game);
    setSearchQuery(game.name);
    setShowSuggestions(false);
    setErrors((prev) => ({ ...prev, game: false }));

    if (game.editions && game.editions.length === 1) {
      setSelectedEdition(game.editions[0]);
      setErrors((prev) => ({ ...prev, edition: false }));
    } else {
      setSelectedEdition("");
    }
    setSelectedSlot("");
  };

  const isNewLogin = useMemo(() => {
    if (!login.trim()) return false;
    const searchEmail = login.trim().toLowerCase();
    for (const game of gamesList) {
      if (game.accountDetails) {
        for (const ed in game.accountDetails) {
          for (const acc of game.accountDetails[ed]) {
            if (acc.email.toLowerCase() === searchEmail) return false;
          }
        }
      }
    }
    return true;
  }, [login, gamesList]);

const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const newErrors: Record<string, boolean> = {};
    if (!login.trim()) newErrors.login = true;
    if (!selectedGame) newErrors.game = true;
    if (!selectedEdition) newErrors.edition = true;
    if (useManualDate && !manualDate) newErrors.manualDate = true;

    if (orderType === "Шеринг") {
      if (!client.trim()) newErrors.client = true;
      if (!selectedSlot) newErrors.slot = true;
      if (selectedSlot === "Возврат" && !replacementSlot) newErrors.replacementSlot = true;
      if (!price) newErrors.price = true;
    }

    if (orderType === "Шеринг аккаунт") {
      if (!expenseValue) newErrors.expense = true;
      
      if (!isNewLogin && login.trim() !== "") newErrors.duplicateLogin = true; 
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return; 
    }

    if (orderType === "Шеринг" && Number(price) === 0 && price.trim() !== "") {
      setShowZeroPriceModal(true);
      return;
    }

    proceedSubmit();
  };

  const proceedSubmit = async () => {
    setIsSubmitting(true);
    setShowZeroPriceModal(false);

    const finalSlot = selectedSlot === "Возврат" ? replacementSlot : selectedSlot;
    const finalPrice = selectedSlot === "Возврат" ? `-${price.replace("-", "")}` : price;

    try {
      const requestPayload: any = {
        action: orderType === "Шеринг аккаунт" ? "addAccount" : "addOrder",
        login: login.trim(),
        gameName: selectedGame.name,
        edition: selectedEdition,
        employee: employee,
        manualDate: useManualDate ? manualDate : "",
      };

      if (orderType === "Шеринг аккаунт") {
        requestPayload.expense = expenseValue;
        requestPayload.currency = currency;
      } else {
        requestPayload.client = client.trim();
        requestPayload.slot = finalSlot;
        requestPayload.price = finalPrice;
        requestPayload.paymentMethod = selectedSlot === "Возврат" ? "" : paymentMethod;
        requestPayload.expense = isNewLogin && expenseValue ? expenseValue : "";
        requestPayload.currency = isNewLogin && expenseValue ? currency : "";
      }

      const request = apiFetch(API_URL, {
        method: "POST",
        keepalive: true, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      await Promise.race([
        request,
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);

      setToastStatus({
        type: "success",
        message: orderType === "Шеринг аккаунт" ? "аккаунт добавлен" : "успешно добавлен",
        onOk: () => {
          setToastStatus(null);
          onClose();
          if (fetchItems) {
            fetchItems(true);
            setTimeout(() => fetchItems(true), 2500);
          }
        },
      });
    } catch (error) {
      setToastStatus({
        type: "error",
        message: "Ошибка при отправке!",
        onOk: () => {
          setToastStatus(null);
          setIsSubmitting(false);
        },
      });
    }
  };

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{
        type: "spring",
        damping: 35,
        stiffness: 300,
        mass: 1,
        restDelta: 0.01,
      }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#121212] w-full max-w-md mx-auto h-[100dvh] overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 pb-5 pt-14 sm:pt-6 border-b border-white/5 shrink-0 bg-[#1a1a1a]/85 backdrop-blur-xl z-10">
        
        <div className="flex flex-col items-start mt-1">
          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-0.5 ml-0.5">
            Новое добавление
          </span>
          <div className="relative flex items-center bg-transparent cursor-pointer">
            <span className="text-[22px] font-bold text-white tracking-tight mr-1.5 leading-none">
              {orderType}
            </span>
            <ChevronDown size={16} strokeWidth={3} className="text-white/70" />
            <select 
              value={orderType}
              onChange={(e) => {
                setOrderType(e.target.value);
                setErrors({});
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
            >
              <option value="Шеринг">Шеринг</option>
              <option value="Шеринг аккаунт">Шеринг аккаунт</option>
              <option value="Стандарт" disabled>Стандарт</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center bg-[#262626] hover:bg-white/10 transition-colors rounded-full px-3 py-2 border border-white/5 shadow-sm">
            <ChevronDown size={14} strokeWidth={2.5} className="text-neutral-400 mr-1.5" />
            <span className="text-[13px] font-medium text-white/90 select-none mr-1">
              {employee}
            </span>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
            >
              {EMPLOYEES.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#262626] text-neutral-400 active:scale-90 transition-all border border-white/5"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5 pb-6">
        <form id="orderForm" onSubmit={handleSubmit} className="space-y-5">
          
          {orderType === "Шеринг" && (
            <div className="space-y-1.5">
              <label className="text-[13px] text-neutral-400 pl-1">
                👤 Клиент
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  setErrors((prev) => ({ ...prev, client: false }));
                }}
                placeholder="Имя или ник"
                className={`w-full ${getBgClass(client)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                  errors.client
                    ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                    : "border-white/5 focus:border-green-500/50"
                }`}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] text-neutral-400 pl-1">
              ✉️ Логин
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                setErrors((prev) => ({ ...prev, login: false }));
              }}
              placeholder="example@email.com"
              className={`w-full ${getBgClass(login)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                errors.login
                  ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                  : "border-white/5 focus:border-green-500/50"
              }`}
            />
          </div>

          <div className="space-y-1.5 relative" ref={searchContainerRef}>
            <label className="text-[13px] text-neutral-400 pl-1 flex justify-between items-center">
              <span>🎮 Игра</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  if (!isAutoFilled) {
                    setSearchQuery(e.target.value);
                    setSelectedGame(null);
                    setShowSuggestions(true);
                    setErrors((prev) => ({ ...prev, game: false }));
                  }
                }}
                onFocus={() => !isAutoFilled && setShowSuggestions(true)}
                disabled={isAutoFilled}
                placeholder="Введите название"
                className={`w-full ${getBgClass(searchQuery, isAutoFilled)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                  errors.game
                    ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                    : "border-white/5 focus:border-green-500/50"
                } ${isAutoFilled ? "pr-11" : ""}`}
              />
              {isAutoFilled && (
                <Check
                  size={18}
                  strokeWidth={3}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none"
                />
              )}
            </div>

            <AnimatePresence>
              {showSuggestions && filteredGames.length > 0 && !isAutoFilled && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute z-50 top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl custom-scrollbar"
                >
                  {filteredGames.map((game: any, index: number) => (
                    <div
                      key={index}
                      onClick={() => handleSelectGame(game)}
                      className="px-4 py-3 text-[14px] text-white hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0"
                    >
                      {game.name}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className={`grid ${orderType === "Шеринг" ? "grid-cols-[3fr_2fr]" : "grid-cols-1"} gap-3`}>
            <div className="space-y-1.5">
              <label className="text-[13px] text-neutral-400 pl-1">
                Издание
              </label>
              <div className="relative">
                <select
                  value={selectedEdition}
                  onChange={(e) => {
                    setSelectedEdition(e.target.value);
                    setErrors((prev) => ({ ...prev, edition: false }));
                  }}
                  disabled={!selectedGame || isAutoFilled}
                  className={`w-full ${getBgClass(selectedEdition, isAutoFilled)} border rounded-xl px-4 py-3 text-[14px] outline-none transition-colors appearance-none ${
                    !selectedEdition ? "text-transparent" : "text-white"
                  } ${
                    errors.edition
                      ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                      : "border-white/5 focus:border-green-500/50"
                  } ${isAutoFilled ? "pr-11" : ""}`}
                >
                  <option value="" disabled></option>
                  {selectedGame?.editions?.map((ed: string) => (
                    <option key={ed} value={ed} className="text-white">
                      {ed}
                    </option>
                  ))}
                </select>
                {!selectedEdition && selectedGame && !isAutoFilled && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-neutral-600 pointer-events-none">
                    Издание
                  </span>
                )}
                {isAutoFilled && (
                  <Check
                    size={18}
                    strokeWidth={3}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none"
                  />
                )}
              </div>
            </div>
            
            {orderType === "Шеринг" && (
              <div className="space-y-1.5">
                <label className="text-[13px] text-neutral-400 pl-1">Слот</label>
                <div className="relative">
                  <select
                    value={selectedSlot}
                    onChange={(e) => {
                      setSelectedSlot(e.target.value);
                      setErrors((prev) => ({ ...prev, slot: false }));
                      if (
                        e.target.value === "Возврат" &&
                        replacementOptions.length > 0
                      ) {
                        setReplacementSlot(replacementOptions[0]);
                      } else {
                        setReplacementSlot("");
                      }
                    }}
                    disabled={!selectedGame}
                    className={`w-full ${getBgClass(selectedSlot)} border rounded-xl px-4 py-3 text-[14px] outline-none transition-colors disabled:opacity-50 appearance-none ${
                      !selectedSlot ? "text-transparent" : "text-white"
                    } ${
                      errors.slot
                        ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                        : "border-white/5 focus:border-green-500/50"
                    }`}
                  >
                    <option value="" disabled></option>
                    {availableSlots.map((slot: string, i: number) => (
                      <option key={i} value={slot} className="text-white">
                        {slot}
                      </option>
                    ))}
                  </select>
                  {!selectedSlot && selectedGame && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-neutral-600 pointer-events-none">
                      Слот
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {orderType === "Шеринг" && selectedSlot === "Возврат" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pt-1">
                  <label className="text-[13px] text-red-500 pl-1 font-medium">
                    Возврат
                  </label>
                  <select
                    value={replacementSlot}
                    onChange={(e) => {
                      setReplacementSlot(e.target.value);
                      setErrors((prev) => ({
                        ...prev,
                        replacementSlot: false,
                      }));
                    }}
                    className={`w-full ${getBgClass(replacementSlot)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors appearance-none ${
                      errors.replacementSlot
                        ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                        : "border-white/5 focus:border-green-500/50"
                    }`}
                  >
                    <option value="" disabled></option>
                    {replacementOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {orderType === "Шеринг" && (
            <div
              className={`grid gap-3 ${
                selectedSlot === "Возврат" ? "grid-cols-1" : "grid-cols-[3fr_2fr]"
              }`}
            >
              <div className="space-y-1.5">
                <label className="text-[13px] text-neutral-400 pl-1">
                  {selectedSlot === "Возврат" ? "Сумма" : "Цена"}
                </label>
                <div className="relative">
                  {selectedSlot === "Возврат" && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-white font-medium pointer-events-none">
                      -
                    </span>
                  )}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setErrors((prev) => ({ ...prev, price: false }));
                    }}
                    placeholder={
                      selectedSlot === "Возврат"
                        ? "Размер скидки на след. заказ"
                        : "Оплата от клиента"
                    }
                    className={`w-full ${getBgClass(price)} border rounded-xl ${
                      selectedSlot === "Возврат" ? "pl-7" : "pl-4"
                    } pr-8 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                      errors.price
                        ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                        : "border-white/5 focus:border-green-500/50"
                    }`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-neutral-400 font-medium pointer-events-none">
                    ₽
                  </span>
                </div>
              </div>

              {selectedSlot !== "Возврат" && (
                <div className="space-y-1.5">
                  <label className="text-[13px] text-neutral-400 pl-1">
                    Способ оплаты
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={`w-full ${getBgClass(paymentMethod)} border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors appearance-none`}
                  >
                    {PAYMENT_METHODS.map((m: string) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {(orderType === "Шеринг аккаунт" || isNewLogin) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1.5 overflow-hidden"
              >
                <label className="text-[13px] text-neutral-400 pl-1">
                  Расход {orderType === "Шеринг аккаунт" && <span className="text-red-500">*</span>}
                </label>
                <div className="grid grid-cols-[3fr_2fr] gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={expenseValue}
                    onChange={(e) => {
                      setExpenseValue(e.target.value);
                      setErrors((prev) => ({ ...prev, expense: false }));
                    }}
                    placeholder="Сумма расхода"
                    className={`w-full ${getBgClass(expenseValue)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                      errors.expense
                        ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                        : "border-white/5 focus:border-green-500/50"
                    }`}
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={`w-full ${getBgClass(currency)} border border-white/5 rounded-xl px-3 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors appearance-none`}
                  >
                    {CURRENCIES.map((c: string) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2 border-t border-white/5 w-full">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={useManualDate}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setUseManualDate(isChecked);
                  setErrors((prev) => ({ ...prev, manualDate: false }));

                  if (isChecked) {
                    setManualDate(getCurrentDateTimeLocal());
                  } else {
                    setManualDate("");
                  }
                }}
                className="rounded border-white/10 bg-[#1a1a1a] text-green-500 focus:ring-green-500/20"
              />
              <span className="text-[13px] text-neutral-400">
                Ввести дату вручную
              </span>
            </label>

            {useManualDate && (
              <div className="w-full overflow-hidden">
                <input
                  type="datetime-local"
                  value={manualDate}
                  onChange={(e) => {
                    setManualDate(e.target.value);
                    setErrors((prev) => ({ ...prev, manualDate: false }));
                  }}
                  className={`w-full box-border block ${getBgClass(manualDate)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors ${
                    errors.manualDate
                      ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                      : "border-white/5 focus:border-green-500/50"
                  }`}
                  style={{
                    maxWidth: "100%",
                    minWidth: "0",
                    appearance: "none",
                    WebkitAppearance: "none",
                  }}
                />
              </div>
            )}
          </div>
        </form>

        <div className="pt-8 pb-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-4 bg-[#12c83b] text-black text-[18px] font-bold rounded-[22px] active:scale-95 transition-all disabled:opacity-50 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(18,200,59,0.2)]"
          >
            {isSubmitting 
              ? "Отправка..." 
              : orderType === "Шеринг аккаунт" 
                ? "Добавить аккаунт" 
                : "Добавить заказ"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showZeroPriceModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowZeroPriceModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative bg-[#1a1a1c] border border-white/10 rounded-[28px] p-6 w-full max-w-[280px] shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mb-4">
                <span className="text-2xl leading-none">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
                Это замена?
              </h3>
              <p className="text-[14px] text-neutral-400 mb-6 leading-tight">
                Вы указали цену 0 ₽. Подтвердить добавление заказа?
              </p>

              <div className="flex w-full gap-3">
                <button
                  onClick={proceedSubmit}
                  className="flex-1 py-3 rounded-xl bg-[#12c83b] text-black font-bold active:scale-95 transition-all"
                >
                  Да
                </button>
                <button
                  onClick={() => setShowZeroPriceModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/10 border border-white/10 text-white font-medium active:scale-95 transition-all hover:bg-white/20"
                >
                  Нет
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastStatus && (
          <ResultDialog
            type={toastStatus.type}
            message={toastStatus.message}
            onOk={toastStatus.onOk}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}