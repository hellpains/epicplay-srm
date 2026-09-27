import React, { useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "./config";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ChevronDown, Loader2 } from "lucide-react";
import { assignSlotFields, slotNamesFor } from "./slotHistory";

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
  // Логин для подстановки (открыто из строки аккаунта) — по нему сами подставятся игра и издание
  initialLogin = "",
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
  // Вид операции. «Возврат» — без цены и оплаты, в заказ уходит слот «Возврат <слот>»:
  // сервер по нему освобождает слот и пишет возврат в журнал (как и старый пункт «Возврат» в слотах)
  const [operation, setOperation] = useState("Продажа");

  const [employee] = useState(
    localStorage.getItem("last_employee") || EMPLOYEES[0]
  );
  const [client, setClient] = useState("");
  const [login, setLogin] = useState(initialLogin);
  // Замена: аккаунт, который получает клиент (login — аккаунт, который забираем)
  const [newLogin, setNewLogin] = useState("");
  const [newSlot, setNewSlot] = useState("");
  const [showNewLoginSuggestions, setShowNewLoginSuggestions] = useState(false);

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
  // Подсказки для «Клиент» при возврате: кто сейчас занимает слоты этого аккаунта
  const [slotClients, setSlotClients] = useState<
    { client: string; slot: string; field: string; number: number; avitoChatId: string | null }[]
  >([]);
  // Точный слот клиента (slot1..slot5), выбранного из подсказок, — чтобы освободить именно его
  const [selectedSlotField, setSelectedSlotField] = useState("");
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  // Продажа: подсказки клиентов из последних чатов Авито (грузим один раз при первом фокусе)
  const [avitoChats, setAvitoChats] = useState<any[] | null>(null);
  const [isAvitoLoading, setIsAvitoLoading] = useState(false);
  const [avitoError, setAvitoError] = useState("");
  // Чат Авито выбранного клиента — сохраняется в заказ, в истории ник станет ссылкой на чат
  const [avitoChatId, setAvitoChatId] = useState("");
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
    if (isAutoFilled && baseSlots.length > 0 && operation === "Продажа") {
      return [...baseSlots, "Возврат"];
    }
    return baseSlots;
  }, [selectedGame, isAutoFilled, operation]);

  const replacementOptions = useMemo(() => {
    const baseSlots = Array.from(new Set(getSlotsForGame(selectedGame)));
    return baseSlots.map((s) => `Возврат ${s}`);
  }, [selectedGame]);

  // Отметки слотов аккаунта из каталога (true = занят)
  const occupiedFlags = useMemo(() => {
    const account = selectedGame?.accountDetails?.[selectedEdition]?.find(
      (a: any) => a.email?.toLowerCase() === login.trim().toLowerCase()
    );
    return (account?.slots ?? []).map((slot: any) => Boolean(slot.isOccupied)) as boolean[];
  }, [selectedGame, selectedEdition, login]);

  useEffect(() => {
    if ((operation !== "Возврат" && operation !== "Замена") || !isAutoFilled || !login.trim()) {
      setSlotClients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "getSlotHistory", login: login.trim() }),
        });
        const result = await response.json();
        if (cancelled || !result.success) return;
        const hasBoth = Boolean(selectedGame?.hasPS5 && selectedGame?.hasPS4);
        const names = slotNamesFor(hasBoth);
        const { occupants } = assignSlotFields(result.history ?? [], hasBoth, occupiedFlags);
        // Клиенты занятых слотов по порядку; у двух П3 — номер слота
        const list = names
          .map((name, i) => {
            const field = `slot${i + 1}`;
            const occupant = occupants[field];
            if (!occupiedFlags[i] || !occupant?.client) return null;
            const number = names.slice(0, i + 1).filter((n) => n === name).length;
            return {
              client: occupant.client,
              slot: name,
              field,
              number: names.filter((n) => n === name).length > 1 ? number : 0,
              avitoChatId: occupant.avitoChatId,
            };
          })
          .filter(Boolean) as { client: string; slot: string; field: string; number: number; avitoChatId: string | null }[];
        setSlotClients(list);
      } catch {
        // Без подсказок поле работает как обычно
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operation, isAutoFilled, login, occupiedFlags]);

  // Замена: аккаунт, который получает клиент, и его свободные слоты (по данным каталога)
  const newAccount = useMemo(() => {
    const email = newLogin.trim().toLowerCase();
    if (!email) return null;
    for (const game of gamesList) {
      for (const ed in game.accountDetails ?? {}) {
        const account = game.accountDetails[ed].find((a: any) => a.email?.toLowerCase() === email);
        if (account) return { game, edition: ed, account };
      }
    }
    return null;
  }, [newLogin, gamesList]);

  // Подсказки для «Выдаём аккаунт»: все аккаунты выбранной игры, кроме того, что забираем.
  // Сначала — со свободными слотами
  const newLoginSuggestions = useMemo(() => {
    if (!selectedGame) return [];
    const oldEmail = login.trim().toLowerCase();
    const names = getSlotsForGame(selectedGame);
    const list: { email: string; edition: string; free: number }[] = [];
    for (const ed in selectedGame.accountDetails ?? {}) {
      for (const acc of selectedGame.accountDetails[ed]) {
        if (!acc.email || acc.email.toLowerCase() === oldEmail) continue;
        const free = names.filter((_: string, i: number) => !acc.slots?.[i]?.isOccupied).length;
        list.push({ email: acc.email, edition: ed, free });
      }
    }
    const q = newLogin.trim().toLowerCase();
    const isPicked = list.some((a) => a.email === newLogin);
    return list
      .filter((a) => !q || isPicked || a.email.toLowerCase().includes(q))
      .sort((a, b) => Number(b.free > 0) - Number(a.free > 0));
  }, [selectedGame, login, newLogin]);

  const isSameAccount = Boolean(newLogin.trim()) && newLogin.trim().toLowerCase() === login.trim().toLowerCase();

  const newSlotOptions = useMemo(() => {
    if (!newAccount) return [];
    const names = getSlotsForGame(newAccount.game);
    const free: Record<string, number> = {};
    names.forEach((name: string, i: number) => {
      if (!newAccount.account.slots?.[i]?.isOccupied) free[name] = (free[name] ?? 0) + 1;
    });
    return (Array.from(new Set(names)) as string[]).map((name) => ({ name, free: free[name] ?? 0 }));
  }, [newAccount]);

  // По умолчанию на новом аккаунте — такой же слот, как у клиента был (если свободен)
  useEffect(() => {
    if (!newAccount) return setNewSlot("");
    setNewSlot((current) => {
      if (newSlotOptions.some((o) => o.name === current && o.free > 0)) return current;
      const same = newSlotOptions.find((o) => o.name === selectedSlot && o.free > 0);
      return same ? same.name : "";
    });
  }, [newAccount, newSlotOptions, selectedSlot]);

  const AVITO_SUGGESTIONS = 20;

  const loadAvitoChats = async () => {
    if (avitoChats !== null || isAvitoLoading) return;
    setIsAvitoLoading(true);
    setAvitoError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "avitoChats" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!result.success) throw new Error(result.error || "Не удалось загрузить чаты Авито");
      setAvitoChats((result.chats ?? []).slice(0, AVITO_SUGGESTIONS));
    } catch (e) {
      setAvitoError((e as Error).message);
    } finally {
      setIsAvitoLoading(false);
    }
  };

  const filteredAvitoChats = useMemo(() => {
    const list = avitoChats ?? [];
    const q = client.trim().toLowerCase();
    const isPicked = list.some((c: any) => c.name === client);
    return q && !isPicked ? list.filter((c: any) => c.name.toLowerCase().includes(q)) : list;
  }, [avitoChats, client]);

  const avitoTime = (seconds: number) => {
    if (!seconds) return "";
    const d = new Date(seconds * 1000);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };

  // Если имя в поле — ровно выбранный клиент со слота, показываем весь список; иначе фильтруем по вводу
  const filteredSlotClients = useMemo(() => {
    const q = client.trim().toLowerCase();
    const isPicked = slotClients.some((c) => c.client === client && c.field === selectedSlotField);
    return q && !isPicked ? slotClients.filter((c) => c.client.toLowerCase().includes(q)) : slotClients;
  }, [slotClients, client, selectedSlotField]);

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
      // При возврате полей цены и способа оплаты нет
      if (!price && operation === "Продажа") newErrors.price = true;
    }

    if (orderType === "Шеринг аккаунт") {
      if (!expenseValue) newErrors.expense = true;
      
      if (!isNewLogin && login.trim() !== "") newErrors.duplicateLogin = true; 
    }

    if (orderType === "Шеринг" && operation === "Замена") {
      if (!newAccount || isSameAccount) newErrors.newLogin = true;
      if (!newSlot) newErrors.newSlot = true;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return; 
    }


    if (orderType === "Шеринг" && operation === "Замена") {
      proceedReplacement();
      return;
    }

    if (orderType === "Шеринг" && operation !== "Возврат" && Number(price) === 0 && price.trim() !== "") {
      setShowZeroPriceModal(true);
      return;
    }

    proceedSubmit();
  };

  // Замена = возврат на старом аккаунте (слот освобождается) + продажа на новом (слот занимается).
  // Цена — необязательная доплата клиента (например, при переходе с П2 на П3).
  const proceedReplacement = async () => {
    if (!newAccount) return;
    setIsSubmitting(true);
    const send = async (payload: Record<string, unknown>) => {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addOrder", employee, manualDate: useManualDate ? manualDate : "", ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || `сервер ответил ${response.status}`);
    };

    let oldFreed = false;
    try {
      await send({
        login: login.trim(),
        gameName: selectedGame.name,
        edition: selectedEdition,
        client: client.trim(),
        slot: `Возврат ${selectedSlot}`,
        slotField: selectedSlotField,
        price: "",
        paymentMethod: "",
      });
      oldFreed = true;
      await send({
        login: newAccount.account.email,
        gameName: newAccount.game.name,
        edition: newAccount.edition,
        client: client.trim(),
        slot: newSlot,
        avitoChatId,
        price: price.trim(),
        paymentMethod: price.trim() ? paymentMethod : "",
      });

      setToastStatus({
        type: "success",
        message: "замена оформлена",
        onOk: () => {
          setToastStatus(null);
          onClose();
          if (fetchItems) {
            fetchItems(true);
            setTimeout(() => fetchItems(true), 2500);
          }
        },
      });
    } catch (e) {
      setToastStatus({
        type: "error",
        message: oldFreed
          ? "слот на старом аккаунте освобождён, а на новом занять не удалось — проверьте новый аккаунт"
          : `замена не оформлена: ${(e as Error).message}`,
        onOk: () => {
          setToastStatus(null);
          setIsSubmitting(false);
          if (oldFreed && fetchItems) fetchItems(true);
        },
      });
    }
  };

  const proceedSubmit = async () => {
    setIsSubmitting(true);
    setShowZeroPriceModal(false);

    const isReturnOperation = orderType === "Шеринг" && operation === "Возврат";
    const finalSlot = isReturnOperation
      ? `Возврат ${selectedSlot}`
      : selectedSlot === "Возврат"
      ? replacementSlot
      : selectedSlot;
    const finalPrice = isReturnOperation
      ? ""
      : selectedSlot === "Возврат"
      ? `-${price.replace("-", "")}`
      : price;

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
        requestPayload.paymentMethod = isReturnOperation || selectedSlot === "Возврат" ? "" : paymentMethod;
        if (isReturnOperation && selectedSlotField) requestPayload.slotField = selectedSlotField;
        if (avitoChatId) requestPayload.avitoChatId = avitoChatId;
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
        message:
          orderType === "Шеринг аккаунт"
            ? "аккаунт добавлен"
            : isReturnOperation
            ? "возврат оформлен"
            : "успешно добавлен",
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
        
        <div className="flex-1 flex justify-center px-2 min-w-0">
          <div className="relative flex items-center bg-[#262626] hover:bg-white/10 transition-colors rounded-full px-3 py-2 border border-white/5 shadow-sm">
            <ChevronDown size={14} strokeWidth={2.5} className="text-neutral-400 mr-1.5" />
            <span className="text-[13px] font-medium text-white/90 select-none mr-1">{operation}</span>
            <select
              value={operation}
              onChange={(e) => {
                setOperation(e.target.value);
                // Старый пункт «Возврат» в слотах в режиме возврата не нужен
                if (e.target.value !== "Продажа" && selectedSlot === "Возврат") setSelectedSlot("");
                setErrors({});
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
            >
              <option value="Продажа">Продажа</option>
              <option value="Замена">Замена</option>
              <option value="Возврат">Возврат</option>
            </select>
          </div>
        </div>

        {/* Выбор сотрудника убран: в заказ уходит последний выбранный (last_employee) */}
        <div className="flex items-center gap-2.5">
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
              <div className="relative">
              <input
                type="text"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  setAvitoChatId("");
                  setErrors((prev) => ({ ...prev, client: false }));
                  setShowClientSuggestions(true);
                }}
                // onClick — чтобы список открывался и при повторном нажатии на уже активное поле
                onFocus={() => {
                  setShowClientSuggestions(true);
                  if (operation === "Продажа") loadAvitoChats();
                }}
                onClick={() => setShowClientSuggestions(true)}
                onBlur={() => setShowClientSuggestions(false)}
                placeholder={operation !== "Продажа" && slotClients.length > 0 ? "Выберите клиента со слота" : "Имя или ник"}
                className={`w-full ${getBgClass(client)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                  errors.client
                    ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                    : "border-white/5 focus:border-green-500/50"
                }`}
              />
              {/* Клиенты на слотах при возврате: выпадают по нажатию на поле, после выбора скрываются */}
              <AnimatePresence>
                {operation === "Продажа" && showClientSuggestions && (isAvitoLoading || avitoError || filteredAvitoChats.length > 0) && (
                  <motion.div
                    key="avito-chats"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] custom-scrollbar p-1.5"
                  >
                    <div className="px-3 pt-1.5 pb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                      Чаты Авито
                    </div>
                    {isAvitoLoading ? (
                      <div className="flex justify-center py-5">
                        <Loader2 size={20} className="animate-spin text-neutral-500" />
                      </div>
                    ) : avitoError ? (
                      <div className="px-3 pb-3 text-[13px] text-red-400">{avitoError}</div>
                    ) : (
                      filteredAvitoChats.map((chat: any) => (
                        <div
                          key={chat.id}
                          // onMouseDown — срабатывает раньше, чем поле потеряет фокус
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setClient(chat.name);
                            setAvitoChatId(chat.id);
                            setErrors((prev) => ({ ...prev, client: false }));
                            setShowClientSuggestions(false);
                          }}
                          className={`px-2.5 py-2 flex items-center gap-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5 active:bg-white/10 ${
                            client === chat.name ? "bg-[#12c83b]/10" : ""
                          }`}
                        >
                          {chat.avatar ? (
                            <img src={chat.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white/5" />
                          ) : (
                            <div className="w-10 h-10 rounded-full shrink-0 bg-white/10 flex items-center justify-center text-white font-bold">
                              {String(chat.name).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[14px] font-semibold text-white truncate">{chat.name}</span>
                              <span className={`text-[11px] shrink-0 ${chat.unread ? "text-[#12c83b]" : "text-neutral-500"}`}>
                                {avitoTime(chat.updated)}
                              </span>
                            </div>
                            {chat.itemTitle && (
                              <div className="text-[12px] text-neutral-400 truncate">
                                {chat.itemTitle}
                                {chat.itemPrice ? ` · ${chat.itemPrice}` : ""}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] text-neutral-500 truncate">
                                {chat.lastDirection === "out" ? "Вы: " : ""}
                                {chat.lastText}
                              </span>
                              {chat.unread && <span className="w-2 h-2 rounded-full bg-[#12c83b] shrink-0" />}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
                {operation !== "Продажа" && showClientSuggestions && filteredSlotClients.length > 0 && (
                  <motion.div
                    key="slot-clients"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] custom-scrollbar p-1.5"
                  >
                    <div className="px-3 pt-1.5 pb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                      Сейчас на слотах
                    </div>
                    {filteredSlotClients.map((c, index) => {
                      const isPicked = client === c.client && selectedSlotField === c.field;
                      return (
                        <div
                          key={index}
                          // onMouseDown — срабатывает раньше, чем поле потеряет фокус
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setClient(c.client);
                            setAvitoChatId(c.avitoChatId ?? "");
                            setSelectedSlot(c.slot);
                            setSelectedSlotField(c.field);
                            setErrors((prev) => ({ ...prev, client: false, slot: false }));
                            setShowClientSuggestions(false);
                          }}
                          className={`px-3 py-2.5 flex items-center justify-between gap-3 rounded-xl text-[14px] cursor-pointer transition-colors ${
                            isPicked ? "bg-[#ff3b30]/10 text-white" : "text-neutral-200 hover:bg-white/5 active:bg-white/10"
                          }`}
                        >
                          <span className="truncate">{c.client}</span>
                          <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#12c83b]/15 text-[13px] font-semibold text-[#12c83b]">
                            {c.slot}
                            {c.number ? ` · ${c.number}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] text-neutral-400 pl-1">
              {orderType === "Шеринг" && operation === "Замена" ? "📤 Забираем аккаунт" : "✉️ Логин"}
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

          {orderType === "Шеринг" && operation === "Замена" && (
            <div className="space-y-1.5">
              <label className="text-[13px] text-neutral-400 pl-1">📥 Выдаём аккаунт</label>
              <div className="relative">
              <input
                type="text"
                value={newLogin}
                onChange={(e) => {
                  setNewLogin(e.target.value);
                  setErrors((prev) => ({ ...prev, newLogin: false }));
                  setShowNewLoginSuggestions(true);
                }}
                onFocus={() => setShowNewLoginSuggestions(true)}
                onClick={() => setShowNewLoginSuggestions(true)}
                onBlur={() => setShowNewLoginSuggestions(false)}
                placeholder="Аккаунт, который получает клиент"
                className={`w-full ${getBgClass(newLogin)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-neutral-600 ${
                  errors.newLogin
                    ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                    : "border-white/5 focus:border-[#0a84ff]/50"
                }`}
              />
              <AnimatePresence>
                {showNewLoginSuggestions && newLoginSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] custom-scrollbar p-1.5"
                  >
                    <div className="px-3 pt-1.5 pb-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                      Аккаунты · {selectedGame?.name}
                    </div>
                    {newLoginSuggestions.map((a) => (
                      <div
                        key={a.email}
                        // onMouseDown — срабатывает раньше, чем поле потеряет фокус
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setNewLogin(a.email);
                          setErrors((prev) => ({ ...prev, newLogin: false }));
                          setShowNewLoginSuggestions(false);
                        }}
                        className={`px-3 py-2.5 flex items-center justify-between gap-3 rounded-xl text-[14px] cursor-pointer transition-colors hover:bg-white/5 active:bg-white/10 ${
                          a.email === newLogin ? "bg-[#0a84ff]/10" : ""
                        } ${a.free > 0 ? "text-neutral-200" : "text-neutral-600"}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate">{a.email}</div>
                          <div className="text-[11px] text-neutral-500">{a.edition}</div>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold ${
                            a.free > 0 ? "bg-[#12c83b]/15 text-[#12c83b]" : "bg-white/[0.06] text-neutral-500"
                          }`}
                        >
                          {a.free > 0 ? `свободно ${a.free}` : "занят"}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
              {newLogin.trim() && !newAccount && (
                <div className="pl-1 text-[12px] text-red-400">Аккаунт с такой почтой не найден</div>
              )}
              {isSameAccount && (
                <div className="pl-1 text-[12px] text-red-400">Это тот же аккаунт, который забираем</div>
              )}
              {newAccount && !isSameAccount && (
                <div className="pl-1 text-[12px] text-neutral-500">
                  {newAccount.game.name} · {newAccount.edition}
                </div>
              )}
            </div>
          )}

          {orderType === "Шеринг" && operation === "Замена" && newAccount && (
            <div className="space-y-1.5">
              <label className="text-[13px] text-neutral-400 pl-1">Слот на новом аккаунте</label>
              <select
                value={newSlot}
                onChange={(e) => {
                  setNewSlot(e.target.value);
                  setErrors((prev) => ({ ...prev, newSlot: false }));
                }}
                className={`w-full ${getBgClass(newSlot)} border rounded-xl px-4 py-3 text-[14px] text-white outline-none transition-colors appearance-none ${
                  errors.newSlot
                    ? "border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                    : "border-white/5 focus:border-[#0a84ff]/50"
                }`}
              >
                <option value="" disabled>
                  Выберите слот
                </option>
                {newSlotOptions.map((o) => (
                  <option key={o.name} value={o.name} disabled={o.free === 0}>
                    {o.name} {o.free === 0 ? "— занят" : `— свободно ${o.free}`}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                      setSelectedSlotField("");
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

          {orderType === "Шеринг" && operation !== "Возврат" && (
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
                        : operation === "Замена"
                        ? "Необязательно"
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
            className={`w-full py-4 text-[18px] font-bold rounded-[22px] active:scale-95 transition-all disabled:opacity-50 ${
              orderType === "Шеринг" && operation === "Возврат"
                ? "bg-[#ff3b30] text-white shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,59,48,0.25)]"
                : orderType === "Шеринг" && operation === "Замена"
                ? "bg-[#0a84ff] text-white shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(10,132,255,0.25)]"
                : "bg-[#12c83b] text-black shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(18,200,59,0.2)]"
            }`}
          >
            {isSubmitting 
              ? "Отправка..." 
              : orderType === "Шеринг аккаунт" 
                ? "Добавить аккаунт" 
                : operation === "Возврат"
                  ? "Сделать возврат"
                  : operation === "Замена"
                    ? "Сделать замену"
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