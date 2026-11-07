import { Fragment, useState, useRef, useEffect, useMemo } from "react";
import { apiFetch } from "./config";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  RotateCw,
  Plus,
  X,
  ArrowUpDown,
  ChevronLeft,
  Check,
  MoreHorizontal,
  Loader2,
  History,
  UserPlus,
  User,
  Wallet,
  Calendar,
  TrendingUp,
  Pencil,
  Settings,
  Trash2,
  Hand,
  QrCode,
  FileText,
  StickyNote,
  Mail,
  Clock,
  Type,
} from "lucide-react";
import AddGameModal from "./components/AddGameModal";
import AddOrderModal from "./AddOrderModal";
import { assignSlotFields, avitoChatUrl, slotNamesFor, type SlotOccupant } from "./slotHistory";
import PriceTable from "./components/PriceTable";
import StandardPrices from "./components/StandardPrices";
import CdkTokens from "./components/CdkTokens";
import { MyLogo } from "./components/MyLogo";
import { PaymentQrModal } from "./components/PaymentQrModal";
import { TextFormatModal } from "./components/TextFormatModal";
import UsdtRate, { USDT_KEY, USDT_PRICE_KEY } from "./components/UsdtRate";
import CdkDebts, { rub, useCdkDebts } from "./components/CdkDebts";

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
    if (msg.includes("успешно добавлено"))
      return (
        <>
          Издание успешно <br /> добавлено!
        </>
      );
    return msg;
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center px-4 bg-black/45 backdrop-blur-[4px]">
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
          <motion.button
            onTap={onOk}
            whileTap={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="cursor-pointer touch-manipulation select-none w-full text-[17px] text-blue-400 font-semibold py-2.5 transition-colors"
          >
            OK
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

export default function CatalogScreen({
  items,
  setItems,
  isSyncing,
  fetchItems,
  selectedItem,
  setSelectedItem,
  variables = { currencies: [] },
  API_URL,
  // Роль gpt: без «Шеринга» и «Стандарта», в каталоге остаётся только CDK
  cdkOnly = false,
  userRole = "",
  userLogin = "",
}: any) {
  const [activeEditionTab, setActiveEditionTab] = useState("");
  const [showPrices, setShowPrices] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [catalogMode, setCatalogMode] = useState<"шеринг" | "стандарт" | "cdk">(cdkOnly ? "cdk" : "шеринг");
  const [categoryTab, setCategoryTab] = useState("игры");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isTextFormatOpen, setIsTextFormatOpen] = useState(false);
  const [isDebtsOpen, setIsDebtsOpen] = useState(false);
  const usdtRate = Number(variables.standardPrices?.[USDT_KEY]?.[USDT_PRICE_KEY]) || 0;
  const debts = useCdkDebts(API_URL, usdtRate, userRole, userLogin);
  const [isEditingUsdt, setIsEditingUsdt] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popularity");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAddEditionModal, setShowAddEditionModal] = useState(false);
  const [newEditionName, setNewEditionName] = useState("");
  const [isSubmittingEdition, setIsSubmittingEdition] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // Удаление игры из настроек: первое нажатие — подтверждение, второе — удаление
  const [confirmDeleteGame, setConfirmDeleteGame] = useState(false);
  const [isDeletingGame, setIsDeletingGame] = useState(false);
  const [deleteGameError, setDeleteGameError] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsCover, setSettingsCover] = useState("");
  const [settingsEditions, setSettingsEditions] = useState<string[]>([]);
  const [settingsPS5, setSettingsPS5] = useState(true);
  const [settingsPS4, setSettingsPS4] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountLogin, setNewAccountLogin] = useState("");
  const [newAccountEdition, setNewAccountEdition] = useState("");
  const [newAccountExpense, setNewAccountExpense] = useState("");
  const [newAccountCurrency, setNewAccountCurrency] = useState("");
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);

  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    login: string;
    slotName: string;
    slotIndex: number;
    isOccupied: boolean;
    history: any[];
    isLoading: boolean;
    // Кто сейчас на этом слоте (по истории заказов) — для карточки над историей
    occupant: SlotOccupant | null;
  } | null>(null);
  const [isTogglingSlot, setIsTogglingSlot] = useState(false);
  // Изменение цены заказа текущего клиента в окне истории слота
  const [editingOrderPrice, setEditingOrderPrice] = useState(false);
  const [orderPriceDraft, setOrderPriceDraft] = useState("");
  const [isSavingOrderPrice, setIsSavingOrderPrice] = useState(false);
  // Удаление аккаунта из окна «Аккаунт»: первое нажатие спрашивает подтверждение
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  // Сколько заказов на аккаунте (null — ещё считаем). С заказами удалять нельзя — кнопка неактивна
  const [accountOrdersCount, setAccountOrdersCount] = useState<number | null>(null);
  const ordersCountLoginRef = useRef("");
  // Раскрытая строка аккаунта в таблице слотов: "издание|логин" и выбранный в ней слот (для заметки)
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  // Открытое окно заметки к слоту
  const [noteModal, setNoteModal] = useState<{
    email: string;
    slotIndex: number;
    slotName: string;
    savedNote: string;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  // Окно «Сброс общего доступа» для аккаунта
  const [resetModal, setResetModal] = useState<{ email: string; sharedResetAt: string | null } | null>(null);
  const [isSavingReset, setIsSavingReset] = useState(false);
  const [resetError, setResetError] = useState("");
  // «Убрать отметку» — сначала переспрашиваем
  const [confirmRemoveReset, setConfirmRemoveReset] = useState(false);
  // Логин аккаунта, для которого открыто окно добавления заказа
  const [addOrderLogin, setAddOrderLogin] = useState<string | null>(null);

  const [accountModal, setAccountModal] = useState<{
    login: string;
    data: {
      spent: number;
      received: number;
      profit: number;
      createdAt: string;
    } | null;
    isLoading: boolean;
  } | null>(null);
  const [editingSpent, setEditingSpent] = useState(false);
  const [spentDraft, setSpentDraft] = useState("");
  // Редактирование почты аккаунта в окне «Аккаунт»
  const [editingLogin, setEditingLogin] = useState(false);
  const [loginDraft, setLoginDraft] = useState("");
  const [isSavingLogin, setIsSavingLogin] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isSavingSpent, setIsSavingSpent] = useState(false);

  const [toastStatus, setToastStatus] = useState<null | {
    type: "success" | "error";
    message: string;
    onOk: () => void;
  }>(null);

  const [lastCopiedEmail, setLastCopiedEmail] = useState<any>(() =>
    localStorage.getItem("lastCopiedEmail")
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<any>(null);

  const handleCopy = (text: any) => {
    if (
      !text ||
      text === "Почта не указана" ||
      text === "Без почты" ||
      text === "..."
    )
      return;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);

    navigator.clipboard.writeText(text);
    setCopyStatus(text);
    setLastCopiedEmail(text);
    localStorage.setItem("lastCopiedEmail", text);

    copyTimeoutRef.current = setTimeout(() => setCopyStatus(null), 1000);
  };

  const handleOpenItem = (item: any) => {
    const originalEditions = item.editions || [];
    
    let defaultTab = originalEditions.length > 0 ? originalEditions[0] : "";
    for (const edition of originalEditions) {
      if (item.accountDetails?.[edition]?.length > 0) {
        defaultTab = edition;
        break; 
      }
    }

    const updatedItem = { ...item, editions: originalEditions };

    setSelectedItem(updatedItem);
    setActiveEditionTab(defaultTab);
    setShowPrices(false);

    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const isGameMatch = (updatedItem.title || updatedItem.name || "").toLowerCase().includes(query);
      
      let hasAccountMatch = false;
      if (updatedItem.accountDetails) {
        hasAccountMatch = Object.values(updatedItem.accountDetails).some((accounts: any) =>
          accounts.some((acc: any) => acc.email?.toLowerCase().includes(query))
        );
      }

      if (isGameMatch || !hasAccountMatch) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setSearchQuery("");
        setIsSearchActive(false);
      }
    }
  };

  const handleSlotClick = async (
    login: string,
    slotName: string,
    slotIndex: number,
    isOccupied: boolean
  ) => {
    setEditingOrderPrice(false);
    setHistoryModal({
      isOpen: true,
      login,
      slotName,
      slotIndex,
      isOccupied,
      history: [],
      isLoading: true,
      occupant: null,
    });

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "getSlotHistory", login }),
      });
      const result = await response.json();
      
      if (result.success) {
        // Каждый слот отдельно, даже два П3: заказы раскладываются по точным слотам
        const hasBoth = selectedItem?.hasPS5 !== false && selectedItem?.hasPS4 !== false;
        const account = selectedItem?.accountDetails?.[activeEditionTab]?.find((a: any) => a.email === login);
        const flags = (account?.slots ?? []).map((slot: any) => Boolean(slot.isOccupied));
        const { rows, occupants } = assignSlotFields(result.history, hasBoth, flags);
        const field = `slot${slotIndex + 1}`;
        // Последние изменения — сверху
        const filteredHistory = rows.filter((row) => row.field === field).reverse();

        setHistoryModal(prev =>
          prev
            ? { ...prev, history: filteredHistory, isLoading: false, occupant: occupants[field] ?? null }
            : null
        );
      } else {
        setHistoryModal(prev => prev ? { ...prev, isLoading: false } : null);
      }
    } catch (e) {
      console.error(e);
      setHistoryModal(prev => prev ? { ...prev, isLoading: false } : null);
    }
  };

  const handleSaveOrderPrice = async () => {
    const orderId = historyModal?.occupant?.orderId;
    if (!orderId || isSavingOrderPrice) return;
    setIsSavingOrderPrice(true);
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "updateOrderPrice", orderId, price: orderPriceDraft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Не удалось изменить цену");
      setHistoryModal((prev) =>
        prev && prev.occupant
          ? {
              ...prev,
              occupant: { ...prev.occupant, price: result.price },
              history: prev.history.map((row: any) => (row.id === orderId ? { ...row, price: result.price } : row)),
            }
          : prev
      );
      setEditingOrderPrice(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingOrderPrice(false);
    }
  };

  const handleToggleSlotState = async () => {
    if (!historyModal || isTogglingSlot || !selectedItem) return;
    const newOccupied = !historyModal.isOccupied;
    setIsTogglingSlot(true);

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggleSlot",
          gameName: selectedItem.name,
          edition: activeEditionTab,
          email: historyModal.login,
          slotName: historyModal.slotName,
          slotIndex: historyModal.slotIndex,
          newValue: newOccupied ? "1" : "",
        }),
      });
      const result = await response.json();

      if (result.success) {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const manualRecord = {
          client: newOccupied ? "Слот занят вручную" : "Слот освобождён вручную",
          slot: historyModal.slotName,
          date: `${dd}.${mm}.${now.getFullYear()}`,
          price: null,
          event: newOccupied ? "manual_occupy" : "manual_free",
        };
        setHistoryModal((prev) =>
          prev
            ? {
                ...prev,
                isOccupied: newOccupied,
                history: [manualRecord, ...prev.history],
                occupant: newOccupied
                  ? { client: "", orderId: null, price: null, field: `slot${prev.slotIndex + 1}`, avitoChatId: null }
                  : null,
              }
            : null
        );
        fetchItems(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTogglingSlot(false);
    }
  };

  // Нажатие на слот: свёрнутый аккаунт — раскрыть строку; раскрытый — открыть историю слота
  // (заметка открывается кнопкой из истории)
  const handleSlotTap = (expandKey: string, email: string, slotIndex: number, slotName: string, isOccupied: boolean) => {
    if (expandedAccount !== expandKey) {
      setExpandedAccount(expandKey);
      return;
    }
    handleSlotClick(email, slotName, slotIndex, isOccupied);
  };

  // Заметка текущего слота из данных каталога
  const slotNoteOf = (email: string, slotIndex: number) =>
    selectedItem?.accountDetails?.[activeEditionTab]?.find((acc: any) => acc.email === email)?.slots?.[slotIndex]?.note ?? "";

  const openSlotNote = (email: string, slotIndex: number, slotName: string) => {
    const note = slotNoteOf(email, slotIndex);
    setHistoryModal(null);
    setNoteModal({ email, slotIndex, slotName, savedNote: note });
    setNoteDraft(note);
    setNoteError("");
  };

  const handleSaveSlotNote = async (email: string, slotIndex: number, note: string) => {
    if (!selectedItem || isSavingNote) return;
    setIsSavingNote(true);
    setNoteError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateSlotNote",
          gameName: selectedItem.name,
          edition: activeEditionTab,
          email,
          slotIndex,
          note,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Не удалось сохранить заметку");

      // Сразу показываем заметку на слоте, не дожидаясь перезагрузки каталога
      setSelectedItem((prev: any) => {
        if (!prev?.accountDetails?.[activeEditionTab]) return prev;
        const accounts = prev.accountDetails[activeEditionTab].map((acc: any) =>
          acc.email === email
            ? {
                ...acc,
                slots: acc.slots.map((slot: any, i: number) =>
                  i === slotIndex ? { ...slot, note: result.note } : slot
                ),
              }
            : acc
        );
        return { ...prev, accountDetails: { ...prev.accountDetails, [activeEditionTab]: accounts } };
      });
      setNoteModal(null);
      fetchItems(true);
    } catch (e) {
      setNoteError((e as Error).message);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!accountModal || !selectedItem || isDeletingAccount) return;
    setIsDeletingAccount(true);
    setDeleteAccountError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "deleteAccount",
          gameName: selectedItem.name,
          edition: activeEditionTab,
          login: accountModal.login,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Не удалось удалить аккаунт");

      setAccountModal(null);
      setExpandedAccount(null);
      setConfirmDeleteAccount(false);
      fetchItems(true);
    } catch (e) {
      setDeleteAccountError((e as Error).message);
      setConfirmDeleteAccount(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Есть ли у игры аккаунты хотя бы в одном издании — тогда удалять нельзя
  const gameHasAccounts = Object.values(selectedItem?.accountDetails ?? {}).some(
    (list: any) => Array.isArray(list) && list.length > 0
  );

  const handleDeleteGame = async () => {
    if (!selectedItem || gameHasAccounts || isDeletingGame) return;
    if (!confirmDeleteGame) {
      setConfirmDeleteGame(true);
      return;
    }
    setIsDeletingGame(true);
    setDeleteGameError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteGame", id: selectedItem.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Не удалось удалить");
      setShowSettingsModal(false);
      setSelectedItem(null);
      fetchItems(true);
    } catch (e) {
      setDeleteGameError((e as Error).message);
    } finally {
      setIsDeletingGame(false);
      setConfirmDeleteGame(false);
    }
  };

  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Сброс общего доступа — раз в 6 месяцев: с какой даты можно следующий
  const nextResetDate = (last: string | null) => {
    if (!last) return null;
    const d = new Date(`${last}T00:00:00`);
    d.setMonth(d.getMonth() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // Запрет действует, пока не прошло 6 месяцев — тогда стрелка красная
  const isResetLocked = (last: string | null) => {
    const next = nextResetDate(last);
    return Boolean(next && todayIso() < next);
  };
  const ruDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const openResetModal = (account: any) => {
    // Полгода прошли — окно как будто сброса не было: можно сразу сделать новый
    const last = account.sharedResetAt ?? null;
    setResetModal({ email: account.email, sharedResetAt: isResetLocked(last) ? last : null });
    setConfirmRemoveReset(false);
    setResetError("");
  };

  const handleSaveReset = async (date: string) => {
    if (!resetModal || !selectedItem || isSavingReset) return;
    setIsSavingReset(true);
    setResetError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "setAccountReset",
          gameName: selectedItem.name,
          edition: activeEditionTab,
          login: resetModal.email,
          date,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Не удалось сохранить");

      // Сразу показываем отметку на стрелке, не дожидаясь перезагрузки каталога
      setSelectedItem((prev: any) => {
        if (!prev?.accountDetails?.[activeEditionTab]) return prev;
        const accounts = prev.accountDetails[activeEditionTab].map((acc: any) =>
          acc.email === resetModal.email ? { ...acc, sharedResetAt: result.sharedResetAt } : acc
        );
        return { ...prev, accountDetails: { ...prev.accountDetails, [activeEditionTab]: accounts } };
      });
      setResetModal(null);
      fetchItems(true);
    } catch (e) {
      setResetError((e as Error).message);
    } finally {
      setIsSavingReset(false);
    }
  };

  // Годовой таймер аккаунта подписки: сколько осталось от даты добавления
  const subscriptionLeft = (addedAt: string | null | undefined) => {
    if (!addedAt) return null;
    const start = new Date(addedAt);
    if (isNaN(start.getTime())) return null;
    // Считаем по датам, без часов: добавлен сегодня — осталось ровно 12 месяцев
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endLabel = end.toLocaleDateString("ru-RU");
    if (now > end) return { expired: true, text: `Подписка истекла ${endLabel}` };

    // Полные месяцы до конца, затем оставшиеся дни
    let months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    const afterMonths = (m: number) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + m);
      return d;
    };
    while (months > 0 && afterMonths(months) > end) months--;
    const days = Math.floor((end.getTime() - afterMonths(months).getTime()) / 86_400_000);
    const left = [months ? `${months} мес.` : "", days || !months ? `${days} дн.` : ""].filter(Boolean).join(" ");
    return { expired: false, text: `Осталось ${left}` };
  };

  const fmtMoney = (n: number) =>
    `${Math.round(n).toLocaleString("ru-RU")} ₽`;

  const handleSaveSpent = async () => {
    if (!accountModal || !accountModal.data || isSavingSpent) return;
    setIsSavingSpent(true);

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccountExpense",
          login: accountModal.login,
          gameName: selectedItem?.name,
          edition: activeEditionTab,
          expense: spentDraft,
        }),
      });
      const result = await response.json();

      if (result.success) {
        const newSpent = Number(String(spentDraft).replace(",", ".")) || 0;
        setAccountModal((prev) =>
          prev && prev.data
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  spent: newSpent,
                  profit: prev.data.received - newSpent,
                },
              }
            : prev
        );
        setEditingSpent(false);
        fetchItems(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingSpent(false);
    }
  };

  const handleSaveLogin = async () => {
    if (!accountModal || !selectedItem || isSavingLogin) return;
    const newLogin = loginDraft.trim();
    if (!newLogin) return setLoginError("Укажите почту");
    if (newLogin === accountModal.login) return setEditingLogin(false);
    setIsSavingLogin(true);
    setLoginError("");
    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateAccountLogin",
          login: accountModal.login,
          newLogin,
          gameName: selectedItem.name,
          edition: activeEditionTab,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Не удалось изменить почту");

      const oldLogin = accountModal.login;
      setAccountModal((prev) => (prev ? { ...prev, login: result.login } : prev));
      ordersCountLoginRef.current = result.login;
      // Раскрытая строка и подсветка скопированной почты привязаны к почте — переносим на новую
      setExpandedAccount((key) =>
        key === `${activeEditionTab}|${oldLogin}` ? `${activeEditionTab}|${result.login}` : key
      );
      if (lastCopiedEmail === oldLogin) {
        setLastCopiedEmail(result.login);
        localStorage.setItem("lastCopiedEmail", result.login);
      }
      setEditingLogin(false);
      fetchItems(true);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setIsSavingLogin(false);
    }
  };

  const handleAccountClick = async (login: string) => {
    setEditingSpent(false);
    setEditingLogin(false);
    setLoginError("");
    setConfirmDeleteAccount(false);
    setDeleteAccountError("");
    setAccountOrdersCount(null);
    ordersCountLoginRef.current = login;
    setAccountModal({ login, data: null, isLoading: true });

    // Заказы — строки истории без служебного события (ручные «занять/освободить слот» не считаются)
    apiFetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getSlotHistory", login }),
    })
      .then((r) => r.json())
      .then((result) => {
        // Ответ по прошлому аккаунту (окно уже открыли для другого) не применяем
        if (result.success && ordersCountLoginRef.current === login) {
          setAccountOrdersCount(result.history.filter((h: any) => !h.event).length);
        }
      })
      .catch(() => {});

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAccountInfo", login }),
      });
      const result = await response.json();

      if (result.success) {
        setAccountModal((prev) =>
          prev
            ? {
                ...prev,
                isLoading: false,
                data: {
                  spent: Number(result.spent) || 0,
                  received: Number(result.received) || 0,
                  profit: Number(result.profit) || 0,
                  createdAt: result.createdAt || "",
                },
              }
            : null
        );
      } else {
        setAccountModal((prev) =>
          prev ? { ...prev, isLoading: false } : null
        );
      }
    } catch (e) {
      console.error(e);
      setAccountModal((prev) => (prev ? { ...prev, isLoading: false } : null));
    }
  };

  const getTotalAccounts = (item: any) => {
    if (!item.accountDetails) return 0;
    return Object.values(item.accountDetails).reduce<number>(
      (total, accounts) => total + ((accounts as any[])?.length || 0),
      0
    );
  };

  useEffect(() => {
    if (!isSearchActive || !searchQuery || !selectedItem) return;
    const query = searchQuery.toLowerCase();
    const hasInCurrent = selectedItem.accountDetails[activeEditionTab]?.some(
      (acc: any) => acc.email?.toLowerCase().includes(query)
    );

    if (!hasInCurrent) {
      const targetEdition = selectedItem.editions?.find((ed: string) =>
        selectedItem.accountDetails[ed]?.some((acc: any) =>
          acc.email?.toLowerCase().includes(query)
        )
      );
      if (targetEdition && targetEdition !== activeEditionTab) {
        setActiveEditionTab(targetEdition);
      }
    }
  }, [searchQuery, isSearchActive, selectedItem, activeEditionTab]);

  const processedItems = items
    .filter(
      (item: any) => item.type?.toString().toLowerCase().trim() === categoryTab
    )
    .filter((item: any) => {
      const query = searchQuery.toLowerCase();
      const itemName = (item.name || item.title || "").toLowerCase();
      if (itemName.includes(query)) return true;
      if (item.accountDetails) {
        return Object.values(item.accountDetails).some((accounts) =>
          (accounts as any[])?.some((acc) =>
            acc.email?.toLowerCase().includes(query)
          )
        );
      }
      return false;
    })
    .sort((a: any, b: any) =>
      sortBy === "alphabet"
        ? (a.name || "").localeCompare(b.name || "")
        : getTotalAccounts(b) - getTotalAccounts(a)
    );

  const handleAddEditionSubmit = async () => {
    if (!newEditionName.trim()) return;
    setIsSubmittingEdition(true);

    try {
      // Без no-cors: иначе браузер вырезает заголовок входа и сервер молча отклоняет запрос
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addEdition",
          gameName: selectedItem.name,
          type: selectedItem.type,
          edition: newEditionName.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `сервер ответил ${response.status}`);
      }

      setToastStatus({
        type: "success",
        message: "Издание успешно добавлено!",
        onOk: () => {
          setToastStatus(null);
          setShowAddEditionModal(false);
          setNewEditionName("");
          setIsSubmittingEdition(false); 
          fetchItems(true);
        },
      });
    } catch (error) {
      setToastStatus({
        type: "error",
        message: "Ошибка при добавлении",
        onOk: () => {
          setToastStatus(null);
          setIsSubmittingEdition(false);
        },
      });
    }
  };

  const openSettingsModal = () => {
    if (!selectedItem) return;
    setSettingsName(selectedItem.name || "");
    setSettingsCover(selectedItem.coverUrl || "");
    setSettingsEditions(
      selectedItem.editions?.length ? [...selectedItem.editions] : [""]
    );
    setSettingsPS5(selectedItem.hasPS5 !== false);
    setSettingsPS4(selectedItem.hasPS4 !== false);
    setConfirmDeleteGame(false);
    setDeleteGameError("");
    setShowSettingsModal(true);
  };

  const updateSettingsEdition = (index: number, value: string) => {
    setSettingsEditions((prev) =>
      prev.map((e, i) => (i === index ? value : e))
    );
  };

  const addSettingsEdition = () => {
    setSettingsEditions((prev) => (prev.length < 5 ? [...prev, ""] : prev));
  };

  const removeSettingsEdition = (index: number) => {
    setSettingsEditions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveSettings = async () => {
    if (!selectedItem || isSavingSettings) return;

    const name = settingsName.trim();
    const editions = settingsEditions.map((e) => e.trim()).filter((e) => e !== "");

    if (!name) {
      setToastStatus({
        type: "error",
        message: "Введите название",
        onOk: () => setToastStatus(null),
      });
      return;
    }
    if (editions.length === 0) {
      setToastStatus({
        type: "error",
        message: "Добавьте хотя бы одно издание",
        onOk: () => setToastStatus(null),
      });
      return;
    }
    if (!settingsPS5 && !settingsPS4) {
      setToastStatus({
        type: "error",
        message: "Выберите хотя бы одну платформу",
        onOk: () => setToastStatus(null),
      });
      return;
    }

    setIsSavingSettings(true);

    try {
      const cover = settingsCover.trim();
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateGame",
          id: selectedItem.id,
          name,
          coverUrl: cover,
          editions,
          hasPS5: settingsPS5,
          hasPS4: settingsPS4,
        }),
      });
      const result = await response.json();

      if (result.success) {
        const newAccountDetails: Record<string, any[]> = {};
        for (const ed of editions) {
          newAccountDetails[ed] = selectedItem.accountDetails?.[ed] ?? [];
        }
        setSelectedItem({
          ...selectedItem,
          name,
          title: name,
          coverUrl: cover,
          editions,
          hasPS5: settingsPS5,
          hasPS4: settingsPS4,
          accountDetails: newAccountDetails,
        });
        if (!editions.includes(activeEditionTab)) {
          setActiveEditionTab(editions[0] || "");
        }

        setToastStatus({
          type: "success",
          message: "Сохранено!",
          onOk: () => {
            setToastStatus(null);
            setShowSettingsModal(false);
            setIsSavingSettings(false);
            fetchItems(true);
          },
        });
      } else {
        setToastStatus({
          type: "error",
          message: result.error || "Ошибка сохранения",
          onOk: () => {
            setToastStatus(null);
            setIsSavingSettings(false);
          },
        });
      }
    } catch (e) {
      console.error(e);
      setToastStatus({
        type: "error",
        message: "Ошибка сохранения",
        onOk: () => {
          setToastStatus(null);
          setIsSavingSettings(false);
        },
      });
    }
  };

  const openAddAccountModal = () => {
    setNewAccountLogin("");
    setNewAccountExpense("");
    setNewAccountEdition(activeEditionTab || selectedItem?.editions?.[0] || "");
    setNewAccountCurrency(variables.currencies?.[0] || "");
    setShowAddAccountModal(true);
  };

  const handleAddAccountSubmit = async () => {
    if (!newAccountLogin.trim() || !newAccountEdition) return;
    setIsSubmittingAccount(true);

    try {
      // Без no-cors: иначе браузер вырезает заголовок входа и сервер молча отклоняет запрос
      const response = await apiFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addAccount",
          gameName: selectedItem.name,
          edition: newAccountEdition,
          login: newAccountLogin.trim(),
          expense: newAccountExpense,
          currency: newAccountCurrency,
          employee: localStorage.getItem("last_employee") || "",
          manualDate: "",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `сервер ответил ${response.status}`);
      }

      setToastStatus({
        type: "success",
        message: "Аккаунт успешно добавлен!",
        onOk: () => {
          setToastStatus(null);
          setShowAddAccountModal(false);
          setActiveEditionTab(newAccountEdition);
          setNewAccountLogin("");
          setNewAccountExpense("");
          setIsSubmittingAccount(false);
          fetchItems(true);
        },
      });
    } catch (error) {
      setToastStatus({
        type: "error",
        message: "Ошибка при добавлении",
        onOk: () => {
          setToastStatus(null);
          setIsSubmittingAccount(false);
        },
      });
    }
  };

  return (
    <>
      <div
        className={`fixed top-0 left-0 right-0 mx-auto max-w-md z-40 bg-[#1a1a1a]/85 backdrop-blur-xl border-b border-white/5 pb-2 rounded-b-[32px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out ${
          selectedItem ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <div
          className="relative flex items-center px-6 justify-end overflow-hidden"
          style={{
            height: "calc(3.375rem + env(safe-area-inset-top, 24px))",
            paddingTop: "env(safe-area-inset-top, 24px)",
          }}
        >
          <div
            className="absolute left-6 right-6 flex items-center justify-between h-10"
            style={{
              top: "calc(env(safe-area-inset-top, 24px) + 11px)",
            }}
          >
            <div className={`flex items-center gap-2 ${cdkOnly ? "" : "ml-2"}`}>
              {!cdkOnly && <MyLogo className="h-[20px] w-auto text-neutral-400 shrink-0 drop-shadow-sm" />}
              {/* Свой долг в шапке видит только сотрудник с ролью gpt; у админа долги — в разделе «Долги партнёров» */}
              {debts.enabled && cdkOnly && (
                <button
                  onClick={() => {
                    debts.reload();
                    setIsDebtsOpen(true);
                  }}
                  className="h-9 px-3 flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/10 active:scale-95 transition-all"
                >
                  <span className="text-[12px] font-semibold text-neutral-400">Долг:</span>
                  <span className="text-[14px] font-bold text-white tabular-nums whitespace-nowrap">
                    {debts.isLoading ? "—" : rub(debts.total)}
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Роли gpt форматирование текста и QR не нужны */}
              {!isEditingUsdt && !cdkOnly && (
                <>
                  <motion.button
                    onTap={() => setIsTextFormatOpen(true)}
                    whileTap={{ scale: 0.85 }}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="cursor-pointer touch-manipulation select-none h-10 w-10 flex items-center justify-center transition-all"
                  >
                    <Type size={18} className="text-neutral-400" />
                  </motion.button>
                  <motion.button
                    onTap={() => setIsQrOpen(true)}
                    whileTap={{ scale: 0.85 }}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="cursor-pointer touch-manipulation select-none h-10 w-10 flex items-center justify-center transition-all"
                  >
                    <QrCode size={18} className="text-neutral-400" />
                  </motion.button>
                </>
              )}
              <UsdtRate
                standardPrices={variables.standardPrices ?? {}}
                apiUrl={API_URL}
                onSaved={() => fetchItems(true)}
                onEditingChange={setIsEditingUsdt}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`transition-all duration-300 ease-in-out pb-0 ${
          selectedItem
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100"
        }`}
      >
        <div
          style={{
            height: "calc(3.375rem + env(safe-area-inset-top, 24px) + 8px)",
          }}
          className="pointer-events-none shrink-0"
        />

        <div className={cdkOnly ? "mt-4" : "px-6 mt-4 mb-4"}>
          <div className={`${cdkOnly ? "hidden" : "flex"} bg-neutral-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 relative`}>
            <div
              className={`absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/3)] bg-neutral-700 rounded-xl transition-transform duration-200 ease-out ${
                catalogMode === "cdk"
                  ? "translate-x-[200%]"
                  : catalogMode === "стандарт"
                    ? "translate-x-full"
                    : "translate-x-0"
              }`}
            />
            <motion.button
              onTap={() => setCatalogMode("шеринг")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-semibold transition-colors ${
                catalogMode === "шеринг" ? "text-white" : "text-neutral-500"
              }`}
            >
              Шеринг
            </motion.button>
            <motion.button
              onTap={() => setCatalogMode("стандарт")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-semibold transition-colors ${
                catalogMode === "стандарт" ? "text-white" : "text-neutral-500"
              }`}
            >
              Стандарт
            </motion.button>
            <motion.button
              onTap={() => setCatalogMode("cdk")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-semibold transition-colors ${
                catalogMode === "cdk" ? "text-white" : "text-neutral-500"
              }`}
            >
              CDK
            </motion.button>
          </div>
        </div>

        {catalogMode === "шеринг" ? (
        <>
        <div className="flex justify-between items-center px-6 mb-5">
          <div className="flex items-center gap-2 pl-1">
            <motion.button
              onTap={() => setCategoryTab("игры")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none py-2 text-[15px] font-medium transition-colors ${
                categoryTab === "игры" ? "text-white" : "text-neutral-500"
              }`}
            >
              Игры
            </motion.button>
            <span className="text-neutral-600 text-[15px]">·</span>
            <motion.button
              onTap={() => setCategoryTab("подписки")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none py-2 text-[15px] font-medium transition-colors ${
                categoryTab === "подписки" ? "text-white" : "text-neutral-500"
              }`}
            >
              Подписки
            </motion.button>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              onTap={() =>
                setSortBy(sortBy === "alphabet" ? "popularity" : "alphabet")
              }
              whileTap={{ scale: 0.95 }}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className="cursor-pointer touch-manipulation select-none flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-white/10 bg-neutral-800/50 transition-all"
            >
              <ArrowUpDown size={14} className="text-green-500" />
              <span className="text-[13px] font-normal text-white/80">
                {sortBy === "alphabet" ? "A–Z" : "top"}
              </span>
            </motion.button>

            <motion.button
              onTap={() => setIsModalOpen(true)}
              whileTap={{ scale: 0.95 }}
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label={categoryTab === "подписки" ? "Добавить подписку" : "Добавить игру"}
              className="cursor-pointer touch-manipulation select-none w-9 h-9 flex items-center justify-center border border-green-500/60 bg-green-500/5 rounded-full transition-all"
            >
              <Plus size={18} strokeWidth={2.2} className="text-green-500" />
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 pb-10">
          {processedItems.map((item: any, index: number) => (
            <motion.div
              key={item.id || item.name}
              onTap={() => handleOpenItem(item)}
              whileTap={{ scale: 0.95 }}
              style={{ 
                animationDelay: `${index * 30}ms`,
                WebkitTapHighlightColor: "transparent"
              }}
              className="cursor-pointer touch-manipulation select-none aspect-square rounded-2xl overflow-hidden relative animate-[fadeInUp_0.3s_ease-out_both] shadow-xl"
            >
              <img
                src={item.coverUrl}
                className="w-full h-full object-cover pointer-events-none"
                alt={item.title || item.name}
              />
              {categoryTab === "игры" && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-4 right-4 text-[12px] font-medium text-white pointer-events-none">
                    {item.title || item.name}
                  </div>
                </>
              )}
            </motion.div>
          ))}
          {processedItems.length === 0 && (
            <div className="col-span-2 text-center text-neutral-500 text-xs py-10">
              Здесь пока пусто. Обновите список.
            </div>
          )}
        </div>

        {categoryTab === "игры" && (
          <div className="w-full flex justify-center pb-12">
            <span className="text-[12px] font-medium tracking-[0.1em] text-neutral-500 px-5 py-2 rounded-full border border-white/10">
              Количество игр: {processedItems.length}
            </span>
          </div>
        )}
        </>
        ) : catalogMode === "стандарт" ? (
          <StandardPrices
            standardPrices={variables.standardPrices ?? {}}
            apiUrl={API_URL}
            onSaved={() => fetchItems(true)}
          />
        ) : (
          <CdkTokens standardPrices={variables.standardPrices ?? {}} apiUrl={API_URL} />
        )}
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) {
                setSelectedItem(null);
                setIsSearchActive(false);
                setSearchQuery("");
                setIsMenuOpen(false);
              }
            }}
            className="fixed inset-0 z-50 bg-[#121212] flex flex-col mx-auto max-w-md border-x border-white/5 h-[100dvh] overflow-hidden"
          >
            <div className="relative shrink-0 z-40 bg-[#121212] shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-b-[32px] border-b border-white/5 pb-6">
              <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-b-[32px]">
                <img
                  src={selectedItem.coverUrl}
                  className="w-full h-full object-cover scale-110 blur-sm opacity-40 origin-center"
                  alt=""
                />
                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#121212] to-transparent" />
              </div>

              <div
                className="relative w-full z-50"
                style={{ height: "calc(env(safe-area-inset-top, 24px) + 68px)" }}
              >
                <div
                  className="absolute inset-x-0 z-50 flex items-center px-5 gap-2 h-10"
                  style={{ top: "calc(env(safe-area-inset-top, 24px) + 8px)" }}
                >
                  <motion.button
                    onTap={() => {
                      setSelectedItem(null);
                      setIsSearchActive(false);
                      setSearchQuery("");
                      setIsMenuOpen(false);
                    }}
                    whileTap={{ scale: 0.9 }}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="cursor-pointer touch-manipulation select-none w-10 h-10 shrink-0 rounded-full bg-black/40 backdrop-blur-md border border-white/10 transition-all flex items-center justify-center shadow-lg pointer-events-auto"
                  >
                    <ChevronLeft size={22} className="text-white" />
                  </motion.button>

                  <div className="flex-1 h-10 relative">
                    {!isSearchActive && (
                      <motion.button
                        onTap={() => setShowPrices((v) => !v)}
                        whileTap={{ scale: 0.95 }}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        className={`cursor-pointer touch-manipulation select-none absolute left-0 top-0 h-10 px-4 rounded-[20px] backdrop-blur-md flex items-center shadow-lg border w-auto max-w-[calc(100%-96px)] transition-colors ${
                          showPrices ? "bg-white/15 border-white/25" : "bg-black/40 border-white/10"
                        }`}
                      >
                        <h2 className="text-[15px] font-medium text-white/95 whitespace-nowrap truncate">
                          {selectedItem.title || selectedItem.name}
                        </h2>
                      </motion.button>
                    )}

                    <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end left-0 pointer-events-none">
                      <div
                        className={`pointer-events-auto flex items-center h-10 bg-black/40 backdrop-blur-md rounded-[20px] shadow-lg border border-white/10 transition-none cursor-pointer touch-manipulation select-none ${
                          isSearchActive
                            ? "w-full px-3"
                            : "w-10 justify-center"
                        }`}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        onClick={() => {
                          if (!isSearchActive) setIsSearchActive(true);
                        }}
                      >
                        <Search size={18} className="text-white/80 shrink-0" />

                        {isSearchActive && (
                          <div className="flex-1 flex items-center ml-2">
                            <input
                              ref={searchInputRef}
                              autoFocus
                              type="text"
                              placeholder="Поиск..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full bg-transparent border-none outline-none text-white text-[15px]"
                            />
                            <motion.button
                              onTap={(e) => {
                                e.stopPropagation();
                                setIsSearchActive(false);
                                setSearchQuery("");
                              }}
                              whileTap={{ scale: 0.8 }}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                              className="cursor-pointer touch-manipulation select-none p-1 shrink-0"
                            >
                              <X size={16} className="text-white/50" />
                            </motion.button>
                          </div>
                        )}
                      </div>

                      {!isSearchActive && (
                        <div className="ml-2 shrink-0 w-10 h-10 pointer-events-auto relative">
                          <motion.button
                            onTap={openSettingsModal}
                            whileTap={{ scale: 0.9 }}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                            className="cursor-pointer touch-manipulation select-none w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 transition-all flex items-center justify-center shadow-lg"
                          >
                            <MoreHorizontal size={20} className="text-white" />
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {showPrices && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-6 relative z-10 overflow-hidden"
                  >
                    <div className="pb-3">
                      <PriceTable
                        item={selectedItem}
                        API_URL={API_URL}
                        onSaved={() => fetchItems(true)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="px-6 relative z-10">
                <div className="flex bg-black/40 backdrop-blur-md p-1.5 rounded-[18px] border border-white/5 relative">
                  {selectedItem.editions?.length > 1 && (
                    <motion.div
                      className="absolute inset-y-1.5 left-1.5 bg-white/10 rounded-[14px] shadow-xl ring-1 ring-white/20"
                      animate={{
                        width: `calc(${
                          100 / selectedItem.editions.length
                        }% - 6px)`,
                        x: `${
                          selectedItem.editions.indexOf(activeEditionTab) * 100
                        }%`,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  {selectedItem.editions?.map(
                    (edition: string, idx: number) => (
                      <motion.button
                        key={idx}
                        onTap={() => setActiveEditionTab(edition)}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-bold transition-colors ${
                          activeEditionTab === edition
                            ? "text-white"
                            : "text-neutral-500"
                        }`}
                      >
                        {edition}
                      </motion.button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div 
              className="flex-1 overflow-y-auto px-2 pt-2 pb-32 touch-pan-y custom-scrollbar overscroll-contain"
            >
              {activeEditionTab && selectedItem.accountDetails && (
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[12px] text-neutral-500 font-black tracking-[0.05em]">
                      <th className="pb-1 pl-8 align-bottom font-semibold">
                        Логин
                      </th>
                      {(() => {
                        const hasBoth = selectedItem.hasPS5 !== false && selectedItem.hasPS4 !== false;

                        if (hasBoth) {
                          return (
                            <>
                              {["PS5 П3", "PS5 П3", "PS5 П2"].map((s, i) => (
                                <th key={`ps5-${i}`} className="pb-1 text-center w-12 align-bottom">
                                  <div className="flex flex-col items-center leading-tight gap-0.5">
                                    <span>{s.split(" ")[0]}</span>
                                    <span className="text-white/80">{s.split(" ")[1]}</span>
                                  </div>
                                </th>
                              ))}
                              {["PS4 П3", "PS4 П2"].map((s, i) => (
                                <th key={`ps4-${i}`} className="pb-1 text-center w-12 align-bottom">
                                  <div className="flex flex-col items-center leading-tight gap-0.5">
                                    <span>{s.split(" ")[0]}</span>
                                    <span className="text-white/80">{s.split(" ")[1]}</span>
                                  </div>
                                </th>
                              ))}
                            </>
                          );
                        } else {
                          return (
                            <>
                              {["П3", "П3", "П2"].map((s, i) => (
                                <th key={`single-${i}`} className="pb-1 text-center w-12 align-bottom">
                                  <div className="flex flex-col items-center leading-tight gap-0.5">
                                    <span className="text-[11px] text-white">{s}</span>
                                  </div>
                                </th>
                              ))}
                            </>
                          );
                        }
                      })()}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filteredAccounts =
                        selectedItem.accountDetails[activeEditionTab]?.filter(
                          (acc: any) =>
                            acc.email
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase())
                        ) || [];
                      if (filteredAccounts.length > 0) {
                        const hasBothPlatforms = selectedItem.hasPS5 !== false && selectedItem.hasPS4 !== false;
                        // Логин + слоты + пустая колонка справа
                        const columnCount = 1 + (hasBothPlatforms ? 5 : 3) + 1;
                        const slotNames = hasBothPlatforms
                          ? ["PS5 П3", "PS5 П3", "PS5 П2", "PS4 П3", "PS4 П2"]
                          : ["П3", "П3", "П2"];
                        return filteredAccounts.map(
                          (account: any, accIdx: number) => {
                            const expandKey = `${activeEditionTab}|${account.email}`;
                            const isSubscription = String(selectedItem.type ?? "").includes("подп");
                            // У подписок под кнопками ещё строка таймера — нижнее скругление и граница переходят к ней
                            const buttonsBottom = isSubscription ? "" : "border-b";
                            const isExpanded = expandedAccount === expandKey;
                            return (
                            <Fragment key={accIdx}>
                            <tr
                              className={`shadow-sm backdrop-blur-sm transition-colors ${
                                isExpanded ? "bg-white/[0.06]" : "bg-white/[0.03]"
                              }`}
                            >
                              <td
                                className={`pl-8 py-3 text-[13px] font-medium cursor-pointer select-none touch-manipulation border-l border-white/5 transition-colors ${
                                  isExpanded ? "rounded-tl-3xl border-t" : "rounded-l-3xl border-y"
                                } ${
                                  lastCopiedEmail === account.email
                                    ? "bg-green-500/10 text-green-400"
                                    : "bg-transparent text-white"
                                }`}
                                style={{ WebkitTapHighlightColor: "transparent" }}
                                onClick={() => handleCopy(account.email)}
                              >
                                <div className="flex items-center h-full">
                                  {/* Последняя скопированная почта остаётся зелёной, пока не скопируют другую */}
                                  <motion.span
                                    key={
                                      copyStatus === account.email
                                        ? "active"
                                        : "idle"
                                    }
                                    initial={false}
                                    animate={{
                                      color:
                                        lastCopiedEmail === account.email
                                          ? "#12c83b"
                                          : "#e5e5e5",
                                      scale:
                                        copyStatus === account.email ? 1.05 : 1,
                                      fontWeight:
                                        lastCopiedEmail === account.email
                                          ? 700
                                          : 500,
                                    }}
                                    transition={{ duration: 0.2 }}
                                    className="truncate max-w-[85px] leading-none"
                                  >
                                    {account.email || "..."}
                                  </motion.span>
                                </div>
                              </td>
                              
                              {account.slots?.map((slot: any, i: number) => {
                                if (!hasBothPlatforms && i >= 3) return null;

                                const hasNote = Boolean(slot.note);
                                const isSelectedSlot =
                                  isExpanded &&
                                  ((noteModal?.email === account.email && noteModal.slotIndex === i) ||
                                    (historyModal?.login === account.email && historyModal.slotIndex === i));
                                return (
                                  <td
                                    key={i}
                                    onClick={() => handleSlotTap(expandKey, account.email, i, slotNames[i], slot.isOccupied)}
                                    className={`py-3 text-center w-12 border-white/5 cursor-pointer active:bg-white/10 transition-colors ${
                                      isExpanded ? "border-t" : "border-y"
                                    }`}
                                  >
                                    <div
                                      className={`relative w-7 h-7 rounded-full mx-auto flex items-center justify-center transition-all ${
                                        slot.isOccupied
                                          ? "bg-[#12c83b] shadow-[0_0_15px_rgba(18,200,59,0.4)]"
                                          : "bg-white/5 border border-white/10"
                                      } ${
                                        hasNote
                                          ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-[#1c1c1c]"
                                          : isSelectedSlot
                                          ? "ring-2 ring-white/40 ring-offset-2 ring-offset-[#1c1c1c]"
                                          : ""
                                      }`}
                                    >
                                      {slot.isOccupied && (
                                        <Check
                                          size={16}
                                          strokeWidth={4}
                                          className="text-white"
                                        />
                                      )}
                                      {/* Пометка: у слота есть заметка */}
                                      {hasNote && (
                                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-orange-400 border-2 border-[#1c1c1c]" />
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td
                                className={`w-8 py-3 border-r border-white/5 ${
                                  isExpanded ? "rounded-tr-3xl border-t" : "rounded-r-3xl border-y"
                                }`}
                              ></td>
                            </tr>
                            {isExpanded && (
                              // Раскрытая часть разбита по колонкам таблицы: слева — логин и первые слоты,
                              // стрелка и крестик — ровно в колонках двух последних слотов при любой ширине экрана.
                              // У каждой ячейки свой кусок фона; relative -top-2 — сдвиг на отступ между строками,
                              // чтобы панель прилегала к строке
                              <tr>
                                <td colSpan={columnCount - 3} className="p-0">
                                  {/* w-0 min-w-full — занимает ширину колонок, но не растягивает таблицу.
                                      pl-[26px] — кнопки чуть левее почты (у почты отступ 32px), их надписи — чуть правее */}
                                  <div className={`relative -top-2 w-0 min-w-full h-[60px] pl-[26px] flex items-center gap-2 bg-white/[0.06] border-l border-white/5 ${buttonsBottom} ${isSubscription ? "" : "rounded-bl-3xl"}`}>
                                    <motion.button
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => setAddOrderLogin(account.email)}
                                      style={{ WebkitTapHighlightColor: "transparent" }}
                                      className="h-9 px-3 rounded-full border border-[#12c83b]/30 bg-[#12c83b]/15 text-[#12c83b] text-[12px] font-semibold shrink-0 flex items-center gap-1"
                                    >
                                      <Plus size={14} strokeWidth={2.5} /> Добавить
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => handleAccountClick(account.email)}
                                      aria-label="Информация"
                                      title="Информация"
                                      style={{ WebkitTapHighlightColor: "transparent" }}
                                      className="h-9 px-3 rounded-full border border-white/10 bg-white/[0.06] text-white text-[12px] font-semibold shrink-0 flex items-center gap-1"
                                    >
                                      <FileText size={14} /> Инфо
                                    </motion.button>
                                  </div>
                                </td>
                                <td className="p-0 w-12">
                                  <div className={`relative -top-2 h-[60px] flex items-center justify-center bg-white/[0.06] border-white/5 ${buttonsBottom}`}>
                                    {/* Сброс общего доступа; красная обводка — сброс уже был */}
                                    <motion.button
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => openResetModal(account)}
                                      aria-label="Сброс общего доступа"
                                      title="Сброс общего доступа"
                                      style={{ WebkitTapHighlightColor: "transparent" }}
                                      className={`h-9 w-9 rounded-full border bg-white/[0.06] shrink-0 flex items-center justify-center ${
                                        // Красная — сброс сделан и полгода не прошли; зелёная — полгода прошли, сброс снова доступен
                                        isResetLocked(account.sharedResetAt)
                                          ? "border-[#ff3b30] text-[#ff3b30] ring-1 ring-[#ff3b30]/40"
                                          : account.sharedResetAt
                                          ? "border-[#12c83b] text-[#12c83b] ring-1 ring-[#12c83b]/40"
                                          : "border-white/10 text-neutral-400"
                                      }`}
                                    >
                                      <RotateCw size={16} />
                                    </motion.button>
                                  </div>
                                </td>
                                <td className="p-0 w-12">
                                  <div className={`relative -top-2 h-[60px] flex items-center justify-center bg-white/[0.06] border-white/5 ${buttonsBottom}`}>
                                    <motion.button
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => setExpandedAccount(null)}
                                      aria-label="Свернуть"
                                      title="Свернуть"
                                      style={{ WebkitTapHighlightColor: "transparent" }}
                                      className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.06] text-neutral-400 shrink-0 flex items-center justify-center"
                                    >
                                      <X size={17} />
                                    </motion.button>
                                  </div>
                                </td>
                                <td className="p-0 w-8">
                                  <div className={`relative -top-2 h-[60px] bg-white/[0.06] border-r border-white/5 ${buttonsBottom} ${isSubscription ? "" : "rounded-br-3xl"}`} />
                                </td>
                              </tr>
                            )}
                            {isExpanded && isSubscription && (() => {
                              const timer = subscriptionLeft(account.addedAt);
                              return (
                                // Под кнопками: сдвиг на два отступа таблицы — вплотную к строке кнопок
                                <tr>
                                  <td colSpan={columnCount} className="p-0">
                                    <div
                                      className={`relative -top-4 w-0 min-w-full px-8 pb-3 text-[13px] font-medium bg-white/[0.06] rounded-b-3xl border-x border-b border-white/5 ${
                                        !timer ? "text-neutral-500" : timer.expired ? "text-[#ff3b30]" : "text-[#12c83b]"
                                      }`}
                                    >
                                      {/* Линия отделяет таймер от кнопок */}
                                      <div className="pt-2.5 border-t border-white/[0.08] flex items-center gap-1.5 min-w-0">
                                        <Clock size={14} className="shrink-0" />
                                        <span className="truncate">
                                          {timer ? timer.text : "Дата добавления аккаунта неизвестна"}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                            </Fragment>
                            );
                          }
                        );
                      } else {
                        return (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center py-10 text-neutral-500 text-xs font-bold tracking-[0.2em]"
                            >
                              {searchQuery
                                ? "Ничего не найдено"
                                : "Нет добавленных аккаунтов"}
                            </td>
                          </tr>
                        );
                      }
                    })()}
                  </tbody>
                </table>
              )}

              {activeEditionTab && selectedItem.accountDetails && (
                <div className="w-full flex justify-center pt-6 pb-8">
                  <span className="text-[12px] font-medium tracking-[0.1em] text-neutral-500 px-5 py-2 rounded-full border border-white/10 bg-black/20 backdrop-blur-sm">
                    Аккаунтов:{" "}
                    {selectedItem.accountDetails[activeEditionTab]?.filter(
                      (acc: any) =>
                        acc.email
                          ?.toLowerCase()
                          .includes(searchQuery.toLowerCase())
                    ).length || 0}
                  </span>
                </div>
              )}

              {activeEditionTab && selectedItem.accountDetails && (
                <div className="px-6 pb-4">
                  <motion.button
                    onTap={openAddAccountModal}
                    whileTap={{ scale: 0.97 }}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="cursor-pointer touch-manipulation select-none w-full flex items-center justify-center gap-2.5 py-3.5 border border-green-500/30 bg-green-500/5 rounded-2xl transition-all text-white"
                  >
                    <UserPlus size={18} className="text-green-500" />
                    <span className="text-[14px] font-semibold">
                      Добавить аккаунт
                    </span>
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddEditionModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xs bg-[#1c1c1e] border border-white/10 rounded-[28px] p-6 shadow-2xl"
            >
              <h3 className="text-[18px] text-white font-semibold mb-4 tracking-tight">
                Новое издание
              </h3>
              <input
                autoFocus
                value={newEditionName}
                onChange={(e) => setNewEditionName(e.target.value)}
                placeholder="Название (например: Deluxe)"
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white mb-6 outline-none focus:border-green-500/50 transition-colors"
              />
              <div className="flex gap-3">
                <motion.button
                  onTap={() => setShowAddEditionModal(false)}
                  whileTap={{ scale: 0.95 }}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="cursor-pointer touch-manipulation select-none flex-1 py-3.5 text-neutral-400 font-semibold rounded-xl transition-all text-[15px]"
                >
                  Отмена
                </motion.button>
                <motion.button
                  onTap={handleAddEditionSubmit}
                  disabled={isSubmittingEdition}
                  whileTap={{ scale: 0.95 }}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="cursor-pointer touch-manipulation select-none flex-1 py-3.5 bg-[#12c83b] text-black font-semibold rounded-xl transition-all disabled:opacity-50 text-[15px]"
                >
                  {isSubmittingEdition ? "Добавляется..." : "Добавить"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddAccountModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xs bg-[#1c1c1e] border border-white/10 rounded-[28px] p-6 shadow-2xl"
            >
              <h3 className="text-[18px] text-white font-semibold mb-1 tracking-tight">
                Новый аккаунт
              </h3>
              <p className="text-[13px] text-neutral-500 mb-5">
                {selectedItem?.title || selectedItem?.name}
              </p>

              <label className="text-[13px] text-neutral-400 pl-1">
                ✉️ Логин
              </label>
              <input
                autoFocus
                value={newAccountLogin}
                onChange={(e) => setNewAccountLogin(e.target.value)}
                placeholder="example@email.com"
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white mt-1.5 mb-4 outline-none focus:border-green-500/50 transition-colors placeholder:text-neutral-600"
              />

              <label className="text-[13px] text-neutral-400 pl-1">
                Издание
              </label>
              <select
                value={newAccountEdition}
                onChange={(e) => setNewAccountEdition(e.target.value)}
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white mt-1.5 mb-4 outline-none focus:border-green-500/50 transition-colors appearance-none"
              >
                {(selectedItem?.editions || []).map((ed: string) => (
                  <option key={ed} value={ed}>
                    {ed}
                  </option>
                ))}
              </select>

              <label className="text-[13px] text-neutral-400 pl-1">
                Расход
              </label>
              <div className="grid grid-cols-[3fr_2fr] gap-3 mt-1.5 mb-6">
                <input
                  type="number"
                  inputMode="decimal"
                  value={newAccountExpense}
                  onChange={(e) => setNewAccountExpense(e.target.value)}
                  placeholder="Сумма"
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white outline-none focus:border-green-500/50 transition-colors placeholder:text-neutral-600"
                />
                <select
                  value={newAccountCurrency}
                  onChange={(e) => setNewAccountCurrency(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-3.5 text-[15px] text-white outline-none focus:border-green-500/50 transition-colors appearance-none"
                >
                  {(variables.currencies || []).map((c: string) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onTap={() => setShowAddAccountModal(false)}
                  whileTap={{ scale: 0.95 }}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="cursor-pointer touch-manipulation select-none flex-1 py-3.5 text-neutral-400 font-semibold rounded-xl transition-all text-[15px]"
                >
                  Отмена
                </motion.button>
                <motion.button
                  onTap={handleAddAccountSubmit}
                  disabled={isSubmittingAccount || !newAccountLogin.trim()}
                  whileTap={{ scale: 0.95 }}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="cursor-pointer touch-manipulation select-none flex-1 py-3.5 bg-[#12c83b] text-black font-semibold rounded-xl transition-all disabled:opacity-50 text-[15px]"
                >
                  {isSubmittingAccount ? "Добавляется..." : "Добавить"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[30px] p-6 shadow-2xl flex flex-col"
            >
              <button
                onClick={() => setHistoryModal(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>

<div className="flex items-center gap-3 mb-2 pr-8">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
                  <History size={20} className="text-blue-400" />
                </div>
                <div className="flex flex-col items-start">
                  <h3 className="text-lg font-bold text-white tracking-tight leading-none mb-1.5">
                    История: {historyModal.slotName}
                    {(() => {
                      const names = slotNamesFor(selectedItem?.hasPS5 !== false && selectedItem?.hasPS4 !== false);
                      const same = names.filter((n) => n === historyModal.slotName).length;
                      if (same < 2) return null;
                      const number = names.slice(0, historyModal.slotIndex + 1).filter((n) => n === historyModal.slotName).length;
                      return <span className="text-neutral-500"> · {number}</span>;
                    })()}
                  </h3>
                  <div
                    className="cursor-pointer py-1 -my-1"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    onClick={() => handleCopy(historyModal.login)}
                  >
                    <motion.span
                      initial={false}
                      animate={{
                        color:
                          copyStatus === historyModal.login
                            ? "#12c83b"
                            : "#9ca3af", 
                        scale: copyStatus === historyModal.login ? 1.05 : 1,
                        fontWeight: copyStatus === historyModal.login ? 700 : 500,
                      }}
                      transition={{ duration: 0.2 }}
                      className="text-xs truncate max-w-[200px] leading-none inline-block origin-left"
                    >
                      {historyModal.login}
                    </motion.span>
                  </div>
                </div>
              </div>

              {!historyModal.isLoading && (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 ${
                    historyModal.isOccupied
                      ? "bg-[#12c83b]/10 border-[#12c83b]/25"
                      : "bg-white/5 border-white/5"
                  }`}
                >
                  {historyModal.isOccupied ? (
                    <>
                      <div className="min-w-0">
                        {historyModal.occupant?.avitoChatId ? (
                          <a
                            href={avitoChatUrl(historyModal.occupant.avitoChatId)}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[15px] font-bold text-white truncate underline decoration-white/30 underline-offset-4"
                          >
                            {historyModal.occupant.client || "Клиент"}
                          </a>
                        ) : (
                          <div className="text-[15px] font-bold text-white truncate">
                            {historyModal.occupant?.client || "Клиент не указан"}
                          </div>
                        )}
                        <div className="text-[12px] text-[#12c83b]">{historyModal.slotName}</div>
                      </div>
                      {historyModal.occupant?.orderId &&
                        (editingOrderPrice ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              autoFocus
                              type="number"
                              inputMode="decimal"
                              value={orderPriceDraft}
                              onChange={(e) => setOrderPriceDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveOrderPrice();
                              }}
                              placeholder="0"
                              className="w-20 bg-[#121212] border border-green-500/40 rounded-lg px-2 py-1.5 text-[15px] text-white text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              onClick={handleSaveOrderPrice}
                              disabled={isSavingOrderPrice}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#12c83b] text-black active:scale-90 transition-all disabled:opacity-50 shrink-0"
                            >
                              {isSavingOrderPrice ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Check size={16} strokeWidth={3} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setOrderPriceDraft(
                                historyModal.occupant?.price === null || historyModal.occupant?.price === undefined
                                  ? ""
                                  : String(historyModal.occupant.price)
                              );
                              setEditingOrderPrice(true);
                            }}
                            className="flex flex-col items-end shrink-0 active:scale-95 transition-all"
                          >
                            <span className="text-[11px] text-neutral-400">Получено</span>
                            <span className="flex items-center gap-1.5 text-[16px] font-bold text-[#12c83b]">
                              {fmtMoney(Number(historyModal.occupant.price) || 0)}
                              <Pencil size={13} className="text-neutral-500" />
                            </span>
                          </button>
                        ))}
                    </>
                  ) : (
                    <div className="text-[14px] text-neutral-400">Слот свободен</div>
                  )}
                </div>
              )}

              {!historyModal.isLoading && (
                <div className="mt-5 pl-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                  История изменений
                </div>
              )}
              <div
                className={`${historyModal.isLoading ? "mt-4" : "mt-2"} min-h-[120px] max-h-[50vh] overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-2`}
              >
                {historyModal.isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-neutral-500">
                    <Loader2 size={24} className="animate-spin mb-3 text-blue-500" />
                    <span className="text-sm">Загрузка истории...</span>
                  </div>
                ) : historyModal.history.length === 0 ? (
                  <div className="flex items-center justify-center h-full py-8 text-neutral-500 text-sm">
                    Нет записей по этому слоту
                  </div>
                ) : (
                  historyModal.history.map((record, idx) => {
                    const isManual =
                      record.event === "manual_free" || record.event === "manual_occupy";
                    if (isManual) {
                      const freed = record.event === "manual_free";
                      return (
                        <div
                          key={idx}
                          className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between shadow-[0_0_16px_rgba(245,158,11,0.28)]"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-semibold text-amber-100 leading-none flex items-center gap-1.5">
                                <Hand size={13} className="text-amber-400" />
                                {freed ? "Слот освобождён вручную" : "Слот занят вручную"}
                              </span>
                              <span className="text-[11px] leading-none text-amber-400/80">
                                {record.slot}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-amber-300/80 tracking-wide shrink-0 pl-2">
                            {record.date}
                          </span>
                        </div>
                      );
                    }
                    const isReturn = record.slot.toLowerCase().includes("возврат");
                    const priceNum = Number(record.price);
                    const hasPrice =
                      record.price !== null &&
                      record.price !== undefined &&
                      record.price !== "" &&
                      !isNaN(priceNum);
                    return (
                      <div key={idx} className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${isReturn ? "bg-red-500" : "bg-green-500"} shadow-[0_0_8px_${isReturn ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'}]`} />
                          <div className="flex flex-col gap-1">
                            {record.avitoChatId ? (
                              <a
                                href={avitoChatUrl(record.avitoChatId)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-white leading-none underline decoration-white/30 underline-offset-4"
                              >
                                {record.client || "Без имени"}
                              </a>
                            ) : (
                              <span className="text-sm font-semibold text-white leading-none">
                                {record.client || "Без имени"}
                              </span>
                            )}
                            <span className={`text-[11px] leading-none ${isReturn ? "text-red-400" : "text-green-400"}`}>
                              {record.slot}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 pl-2">
                          <span className="text-xs font-medium text-neutral-500 tracking-wide">
                            {record.date}
                          </span>
                          {hasPrice && (
                            <span
                              className={`text-[12px] font-bold leading-none ${
                                priceNum < 0 ? "text-red-400" : "text-green-400"
                              }`}
                            >
                              {priceNum > 0 ? "+" : ""}
                              {priceNum.toLocaleString("ru-RU")} ₽
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {(() => {
                const note = slotNoteOf(historyModal.login, historyModal.slotIndex);
                return (
                  <button
                    onClick={() => openSlotNote(historyModal.login, historyModal.slotIndex, historyModal.slotName)}
                    className="mt-4 w-full py-3 px-4 rounded-2xl text-[15px] font-semibold active:scale-95 transition-all flex items-center justify-center gap-2 border bg-orange-400/10 text-orange-400 border-orange-400/25"
                  >
                    <StickyNote size={16} className="shrink-0" />
                    <span className="truncate">{note ? `Заметка: ${note}` : "Добавить заметку"}</span>
                  </button>
                );
              })()}

              <button
                onClick={handleToggleSlotState}
                disabled={isTogglingSlot}
                className={`mt-2 w-full py-3.5 rounded-2xl font-semibold text-[15px] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border ${
                  historyModal.isOccupied
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-[#12c83b]/10 text-[#12c83b] border-[#12c83b]/25"
                }`}
              >
                {isTogglingSlot ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : historyModal.isOccupied ? (
                  "Освободить слот"
                ) : (
                  "Занять слот"
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <Settings size={18} className="text-green-500" />
                  <h2 className="text-[18px] font-medium text-white">Настройки</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteGame}
                    disabled={gameHasAccounts || isDeletingGame}
                    title={gameHasAccounts ? "Нельзя удалить: у игры есть аккаунты" : "Удалить"}
                    className={`h-8 flex items-center justify-center gap-1.5 rounded-full bg-[#ff3b30]/10 border border-[#ff3b30]/25 text-[#ff3b30] active:scale-90 transition-all disabled:opacity-30 disabled:active:scale-100 ${
                      confirmDeleteGame ? "px-3 text-[13px] font-semibold" : "w-8"
                    }`}
                  >
                    {isDeletingGame ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={15} />
                        {confirmDeleteGame && "Удалить?"}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              {(gameHasAccounts || deleteGameError) && (
                <div
                  className={`px-6 pt-3 text-[12px] ${deleteGameError ? "text-red-400" : "text-neutral-500"}`}
                >
                  {deleteGameError || "Удалить нельзя: у игры есть аккаунты"}
                </div>
              )}

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-[13px] text-neutral-400 pl-1">
                    Обложка (URL)
                  </label>
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/5 shrink-0">
                      {settingsCover.trim() && (
                        <img
                          src={settingsCover}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "0";
                          }}
                          onLoad={(e) => {
                            (e.target as HTMLImageElement).style.opacity = "1";
                          }}
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      value={settingsCover}
                      onChange={(e) => setSettingsCover(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 min-w-0 bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-green-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] text-neutral-400 pl-1">
                    Название
                  </label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] text-neutral-400 pl-1">
                    Издания
                  </label>
                  <div className="space-y-2">
                    {settingsEditions.map((edition, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={edition}
                          onChange={(e) =>
                            updateSettingsEdition(index, e.target.value)
                          }
                          placeholder="Название издания"
                          className="flex-1 min-w-0 bg-[#1a1a1a] border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-green-500/50 transition-colors placeholder:text-neutral-600"
                        />
                        {settingsEditions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSettingsEdition(index)}
                            className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 shrink-0 active:scale-90 transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {settingsEditions.length < 5 && (
                    <button
                      type="button"
                      onClick={addSettingsEdition}
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
                      onClick={() => setSettingsPS5(!settingsPS5)}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 border ${
                        settingsPS5
                          ? "border-green-500 text-green-400 bg-green-500/5"
                          : "border-white/5 text-neutral-500 bg-[#1a1a1a]"
                      }`}
                    >
                      PS5
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsPS4(!settingsPS4)}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 border ${
                        settingsPS4
                          ? "border-green-500 text-green-400 bg-green-500/5"
                          : "border-white/5 text-neutral-500 bg-[#1a1a1a]"
                      }`}
                    >
                      PS4
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 pt-3 border-t border-white/5 shrink-0 flex gap-3">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-3.5 text-neutral-400 font-semibold rounded-xl transition-all text-[15px]"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="flex-1 py-3.5 bg-[#12c83b] text-black font-semibold rounded-xl active:scale-95 transition-all disabled:opacity-50 text-[15px]"
                >
                  {isSavingSettings ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resetModal && (
          <div
            key="reset-modal"
            className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSavingReset) setResetModal(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[30px] p-6 shadow-2xl flex flex-col"
            >
              <button
                onClick={() => setResetModal(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-5 pr-8">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                    resetModal.sharedResetAt
                      ? "bg-[#ff3b30]/15 border-[#ff3b30]/30 text-[#ff3b30]"
                      : "bg-white/5 border-white/10 text-neutral-400"
                  }`}
                >
                  <RotateCw size={19} />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <h3 className="text-lg font-bold text-white tracking-tight leading-none mb-1.5">Сброс общего доступа</h3>
                  <span className="text-xs text-neutral-400 truncate max-w-[210px] leading-none">{resetModal.email}</span>
                </div>
              </div>

              <div
                className={`rounded-2xl border px-4 py-3 ${
                  resetModal.sharedResetAt ? "bg-[#ff3b30]/10 border-[#ff3b30]/25" : "bg-white/5 border-white/5"
                }`}
              >
                <div className="text-[12px] text-neutral-400">Последний сброс</div>
                <div className={`text-[17px] font-bold ${resetModal.sharedResetAt ? "text-[#ff3b30]" : "text-white"}`}>
                  {resetModal.sharedResetAt ? ruDate(resetModal.sharedResetAt) : "Сброса ещё не было"}
                </div>
                {resetModal.sharedResetAt && (
                  <div className="mt-1 text-[12px] text-neutral-400">
                    Следующий сброс — с {ruDate(nextResetDate(resetModal.sharedResetAt)!)}
                  </div>
                )}
              </div>

              {resetError && <div className="mt-3 text-[13px] text-red-400">{resetError}</div>}
              {isResetLocked(resetModal.sharedResetAt) && (
                <div className="mt-3 text-[12px] text-neutral-500">
                  Сброс можно делать раз в 6 месяцев. Если отметили по ошибке — уберите отметку.
                </div>
              )}

              {confirmRemoveReset ? (
                <div className="mt-4">
                  <div className="mb-3 text-center text-[14px] text-white">Точно хотите убрать отметку о сбросе?</div>
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setConfirmRemoveReset(false)}
                      disabled={isSavingReset}
                      style={{ WebkitTapHighlightColor: "transparent" }}
                      className="flex-1 h-12 rounded-full border border-white/10 bg-white/[0.06] text-white text-[14px] disabled:opacity-60"
                    >
                      Отмена
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSaveReset("")}
                      disabled={isSavingReset}
                      style={{ WebkitTapHighlightColor: "transparent" }}
                      className="flex-1 h-12 rounded-full bg-[#ff3b30] text-white text-[14px] font-semibold disabled:opacity-60"
                    >
                      {isSavingReset ? "Убираем…" : "Да, убрать"}
                    </motion.button>
                  </div>
                </div>
              ) : (
              <div className="mt-4 flex gap-2">
                {resetModal.sharedResetAt && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setConfirmRemoveReset(true)}
                    disabled={isSavingReset}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="flex-1 h-12 rounded-full border border-white/10 bg-white/[0.06] text-neutral-300 text-[14px] disabled:opacity-60"
                  >
                    Убрать отметку
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSaveReset(todayIso())}
                  disabled={isSavingReset || isResetLocked(resetModal.sharedResetAt)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="flex-1 h-12 rounded-full bg-[#12c83b] text-black text-[14px] font-semibold disabled:opacity-40"
                >
                  {isSavingReset ? "Сохраняем…" : "Сделать сброс"}
                </motion.button>
              </div>
              )}
            </motion.div>
          </div>
        )}
        {noteModal && (
          <div
            key="note-modal"
            className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSavingNote) setNoteModal(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[30px] p-6 shadow-2xl flex flex-col"
            >
              <button
                onClick={() => setNoteModal(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-5 pr-8">
                <div className="w-10 h-10 rounded-full bg-orange-400/20 flex items-center justify-center shrink-0 border border-orange-400/30">
                  <StickyNote size={20} className="text-orange-400" />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <h3 className="text-lg font-bold text-white tracking-tight leading-none mb-1.5">
                    Заметка · {noteModal.slotName}
                  </h3>
                  <span className="text-xs text-neutral-400 truncate max-w-[210px] leading-none">
                    {noteModal.email}
                  </span>
                </div>
              </div>

              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Например: клиент продлит 01.10"
                rows={4}
                className="w-full resize-none bg-white/[0.04] border border-white/10 rounded-[18px] px-4 py-3 text-[15px] text-white outline-none focus:border-orange-400/50 placeholder:text-neutral-600"
              />
              {noteError && <div className="mt-2 text-[13px] text-red-400">{noteError}</div>}

              <div className="mt-4 flex gap-2">
                {noteModal.savedNote && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSaveSlotNote(noteModal.email, noteModal.slotIndex, "")}
                    disabled={isSavingNote}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="flex-1 h-12 rounded-full border border-white/10 bg-white/[0.06] text-neutral-300 text-[15px] disabled:opacity-60"
                  >
                    Удалить
                  </motion.button>
                )}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSaveSlotNote(noteModal.email, noteModal.slotIndex, noteDraft)}
                  disabled={isSavingNote || noteDraft.trim() === noteModal.savedNote}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="flex-1 h-12 rounded-full bg-orange-400 text-black text-[15px] font-semibold disabled:opacity-40"
                >
                  {isSavingNote ? "Сохраняем…" : "Сохранить"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
        {accountModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[30px] p-6 shadow-2xl flex flex-col"
            >
              <button
                onClick={() => setAccountModal(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-5 pr-8">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0 border border-green-500/30">
                  <User size={20} className="text-green-400" />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <h3 className="text-lg font-bold text-white tracking-tight leading-none mb-1.5">
                    Аккаунт
                  </h3>
                  <div
                    className="cursor-pointer py-1 -my-1"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    onClick={() => handleCopy(accountModal.login)}
                  >
                    <motion.span
                      initial={false}
                      animate={{
                        color:
                          copyStatus === accountModal.login
                            ? "#12c83b"
                            : "#9ca3af",
                        fontWeight: copyStatus === accountModal.login ? 700 : 500,
                      }}
                      transition={{ duration: 0.2 }}
                      className="text-xs truncate max-w-[210px] leading-none inline-block origin-left"
                    >
                      {accountModal.login}
                    </motion.span>
                  </div>
                </div>
              </div>

              {accountModal.isLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
                  <Loader2 size={24} className="animate-spin mb-3 text-green-500" />
                  <span className="text-sm">Загрузка...</span>
                </div>
              ) : !accountModal.data ? (
                <div className="text-center py-10 text-neutral-500 text-sm">
                  Нет данных по аккаунту
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
                    <span className="flex items-center gap-2.5 text-[13px] text-neutral-400 shrink-0">
                      <Mail size={16} className="text-neutral-500" />
                      Почта
                    </span>
                    {editingLogin ? (
                      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                        <input
                          autoFocus
                          type="email"
                          inputMode="email"
                          value={loginDraft}
                          onChange={(e) => {
                            setLoginDraft(e.target.value);
                            setLoginError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveLogin();
                          }}
                          className="min-w-0 flex-1 bg-[#121212] border border-green-500/40 rounded-lg px-3 py-1.5 text-[14px] text-white outline-none"
                        />
                        <button
                          onClick={handleSaveLogin}
                          disabled={isSavingLogin}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#12c83b] text-black active:scale-90 transition-all disabled:opacity-50 shrink-0"
                        >
                          {isSavingLogin ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} strokeWidth={3} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setLoginDraft(accountModal.login);
                          setLoginError("");
                          setEditingLogin(true);
                        }}
                        className="flex items-center gap-2 min-w-0 active:scale-95 transition-all"
                      >
                        <span className="text-[14px] font-semibold text-white truncate">{accountModal.login}</span>
                        <Pencil size={14} className="text-neutral-500 shrink-0" />
                      </button>
                    )}
                  </div>
                  {loginError && <div className="-mt-1 px-1 text-[12px] text-red-400">{loginError}</div>}

                  <div className="flex items-center justify-between gap-2 bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
                    <span className="flex items-center gap-2.5 text-[13px] text-neutral-400 shrink-0">
                      <Wallet size={16} className="text-neutral-500" />
                      Потрачено
                    </span>
                    {editingSpent ? (
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <input
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          value={spentDraft}
                          onChange={(e) => setSpentDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveSpent();
                          }}
                          placeholder="0"
                          className="w-24 bg-[#121212] border border-green-500/40 rounded-lg px-3 py-1.5 text-[15px] text-white text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          onClick={handleSaveSpent}
                          disabled={isSavingSpent}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#12c83b] text-black active:scale-90 transition-all disabled:opacity-50 shrink-0"
                        >
                          {isSavingSpent ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} strokeWidth={3} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSpentDraft(
                            String(Math.round(accountModal.data!.spent))
                          );
                          setEditingSpent(true);
                        }}
                        className="flex items-center gap-2 active:scale-95 transition-all"
                      >
                        <span className="text-[15px] font-semibold text-white">
                          {fmtMoney(accountModal.data.spent)}
                        </span>
                        <Pencil size={14} className="text-neutral-500" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
                    <span className="flex items-center gap-2.5 text-[13px] text-neutral-400">
                      <TrendingUp size={16} className="text-neutral-500" />
                      Получено
                    </span>
                    <span className="text-[15px] font-semibold text-green-400">
                      {fmtMoney(accountModal.data.received)}
                    </span>
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 border ${
                      accountModal.data.profit >= 0
                        ? "bg-green-500/10 border-green-500/20"
                        : "bg-red-500/10 border-red-500/20"
                    }`}
                  >
                    <span className="text-[13px] font-medium text-white/80">
                      Чистая прибыль
                    </span>
                    <span
                      className={`text-[16px] font-bold ${
                        accountModal.data.profit >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {fmtMoney(accountModal.data.profit)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl px-4 py-3">
                    <span className="flex items-center gap-2.5 text-[13px] text-neutral-400">
                      <Calendar size={16} className="text-neutral-500" />
                      Создан
                    </span>
                    <span className="text-[15px] font-semibold text-white">
                      {accountModal.data.createdAt || "—"}
                    </span>
                  </div>
                </div>
              )}

              {deleteAccountError && (
                <div className="mt-4 px-1 text-[13px] text-red-400 text-center">{deleteAccountError}</div>
              )}
              {confirmDeleteAccount ? (
                <div className="mt-4 flex gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setConfirmDeleteAccount(false)}
                    disabled={isDeletingAccount}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="flex-1 h-12 rounded-[18px] border border-white/10 bg-white/[0.06] text-white text-[15px] disabled:opacity-60"
                  >
                    Отмена
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="flex-1 h-12 rounded-[18px] bg-[#ff3b30] text-white text-[15px] font-semibold disabled:opacity-60"
                  >
                    {isDeletingAccount ? "Удаляется..." : "Да, удалить"}
                  </motion.button>
                </div>
              ) : (
                <>
                  <motion.button
                    whileTap={accountOrdersCount === 0 ? { scale: 0.97 } : undefined}
                    onClick={() => {
                      setDeleteAccountError("");
                      setConfirmDeleteAccount(true);
                    }}
                    disabled={accountOrdersCount !== 0}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    className="mt-4 h-12 rounded-[18px] border border-[#ff3b30]/30 bg-[#ff3b30]/10 text-[#ff3b30] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} /> Удалить аккаунт
                  </motion.button>
                  {accountOrdersCount !== null && accountOrdersCount > 0 && (
                    <div className="mt-2 px-1 text-[12px] text-neutral-500 text-center">
                      Нельзя удалить: на аккаунте есть заказы ({accountOrdersCount})
                    </div>
                  )}
                </>
              )}
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

      {isModalOpen && (
        <AddGameModal
          onClose={() => setIsModalOpen(false)}
          onAddGame={() => fetchItems(true)}
          API_URL={API_URL}
          existingGames={items}
          kind={categoryTab === "подписки" ? "подписки" : "игры"}
        />
      )}

      <AnimatePresence>
        {addOrderLogin && (
          <AddOrderModal
            onClose={() => setAddOrderLogin(null)}
            gamesList={items}
            variables={variables}
            fetchItems={fetchItems}
            API_URL={API_URL}
            initialLogin={addOrderLogin}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isQrOpen && <PaymentQrModal onClose={() => setIsQrOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {isDebtsOpen && (
          <CdkDebts
            debts={debts}
            usdtRate={usdtRate}
            showActor={userRole === "admin"}
            onClose={() => setIsDebtsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTextFormatOpen &&<TextFormatModal onClose={() => setIsTextFormatOpen(false)} />}
      </AnimatePresence>
    </>
  );
}