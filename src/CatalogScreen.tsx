import { useState, useRef, useEffect, useMemo } from "react";
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
} from "lucide-react";
import AddGameModal from "./components/AddGameModal";
import PriceTable from "./components/PriceTable";
import { MyLogo } from "./components/MyLogo";

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
}: any) {
  const [activeEditionTab, setActiveEditionTab] = useState("");
  const [showPrices, setShowPrices] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryTab, setCategoryTab] = useState("игры");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popularity");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAddEditionModal, setShowAddEditionModal] = useState(false);
  const [newEditionName, setNewEditionName] = useState("");
  const [isSubmittingEdition, setIsSubmittingEdition] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
  } | null>(null);
  const [isTogglingSlot, setIsTogglingSlot] = useState(false);

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
    setHistoryModal({
      isOpen: true,
      login,
      slotName,
      slotIndex,
      isOccupied,
      history: [],
      isLoading: true,
    });

    try {
      const response = await apiFetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "getSlotHistory", login }),
      });
      const result = await response.json();
      
      if (result.success) {
        
        const baseSlot = slotName.trim();
        const returnSlot = "Возврат " + baseSlot;
        
        const filteredHistory = result.history.filter((h: any) => {
          const s = h.slot.trim();
          return s === baseSlot || s === returnSlot || s.toLowerCase().includes("возврат " + baseSlot.toLowerCase());
        });
        
        setHistoryModal(prev => prev ? { ...prev, history: filteredHistory, isLoading: false } : null);
      } else {
        setHistoryModal(prev => prev ? { ...prev, isLoading: false } : null);
      }
    } catch (e) {
      console.error(e);
      setHistoryModal(prev => prev ? { ...prev, isLoading: false } : null);
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
            ? { ...prev, isOccupied: newOccupied, history: [...prev.history, manualRecord] }
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

  const handleAccountClick = async (login: string) => {
    setEditingSpent(false);
    setAccountModal({ login, data: null, isLoading: true });

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
      await apiFetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addEdition",
          gameName: selectedItem.name,
          type: selectedItem.type,
          edition: newEditionName.trim(),
        }),
      });

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
      await apiFetch(API_URL, {
        method: "POST",
        mode: "no-cors",
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
            height: "calc(4rem + env(safe-area-inset-top, 24px))",
            paddingTop: "env(safe-area-inset-top, 24px)",
          }}
        >
          <AnimatePresence>
            {!isSearchActive && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute left-6 right-6 flex items-center justify-between"
                style={{
                  top: "calc(env(safe-area-inset-top, 24px) + 0.5rem)",
                }}
              >
                <div className="flex items-center gap-2 ml-2">
                  <MyLogo className="h-[20px] w-auto text-neutral-400 shrink-0 drop-shadow-sm" />
                </div>
                <motion.button
                  onTap={() => fetchItems(false)}
                  whileTap={{ scale: 0.85 }}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className="cursor-pointer touch-manipulation select-none h-10 w-10 flex items-center justify-center transition-all mr-12"
                >
                  <RotateCw
                    size={18}
                    className={
                      isSyncing
                        ? "animate-spin text-green-500"
                        : "text-neutral-400"
                    }
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={false}
            animate={{ width: isSearchActive ? 400 : 40 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className={`flex items-center h-10 bg-neutral-800 rounded-full z-10 overflow-hidden cursor-pointer touch-manipulation select-none ${
              isSearchActive
                ? "border border-neutral-700 px-3 shadow-lg"
                : "border border-white/10 justify-center"
            }`}
            style={{
              position: "absolute",
              right: "1.5rem",
              top: "calc(env(safe-area-inset-top, 24px) + 0.5rem)",
              maxWidth: "calc(100% - 3rem)",
              WebkitTapHighlightColor: "transparent"
            }}
            onClick={() => {
              if (!isSearchActive) setIsSearchActive(true);
            }}
          >
            <Search size={18} className="text-neutral-400 shrink-0" />
            <AnimatePresence>
              {isSearchActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="flex-1 flex items-center ml-2"
                >
                  <input
                    ref={searchInputRef}
                    autoFocus
                    type="text"
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-white text-sm"
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
                    <X size={16} className="text-neutral-400" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
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
            height: "calc(4rem + env(safe-area-inset-top, 24px) + 8px)",
          }}
          className="pointer-events-none shrink-0"
        />

        <div className="px-6 mt-4 mb-4">
          <div className="flex bg-neutral-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-neutral-800 relative">
            <div
              className={`absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] bg-neutral-700 rounded-xl transition-transform duration-200 ease-out ${
                categoryTab === "подписки"
                  ? "translate-x-full"
                  : "translate-x-0"
              }`}
            />
            <motion.button
              onTap={() => setCategoryTab("игры")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-semibold transition-colors ${
                categoryTab === "игры" ? "text-white" : "text-neutral-500"
              }`}
            >
              Игры
            </motion.button>
            <motion.button
              onTap={() => setCategoryTab("подписки")}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={`cursor-pointer touch-manipulation select-none relative z-10 flex-1 py-2.5 text-sm font-semibold transition-colors ${
                categoryTab === "подписки" ? "text-white" : "text-neutral-500"
              }`}
            >
              Подписки
            </motion.button>
          </div>
        </div>

        <div className="flex justify-between items-center px-6 mb-5">
          <motion.button
            onTap={() =>
              setSortBy(sortBy === "alphabet" ? "popularity" : "alphabet")
            }
            whileTap={{ scale: 0.95 }}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="cursor-pointer touch-manipulation select-none flex items-center gap-2 pl-1 py-2 rounded-full transition-all"
          >
            <ArrowUpDown size={14} className="text-green-500" />
            <span className="text-[13px] font-regular text-neutral-400">
              {sortBy === "alphabet" ? "по алфавиту" : "популярные"}
            </span>
          </motion.button>
          
          <motion.button
            onTap={() => setIsModalOpen(true)}
            whileTap={{ scale: 0.95 }}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className="cursor-pointer touch-manipulation select-none flex items-center gap-2 pl-3.5 pr-1 py-1 border border-green-500/30 bg-green-500/5 rounded-full transition-all"
          >
            <span className="text-[13px] font-normal text-white/70">
              {categoryTab === "подписки" ? "Добавить" : "Добавить игру"}
            </span>
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(18,200,59,0.25)]">
              <Plus size={14} strokeWidth={2.5} className="text-black" />
            </div>
          </motion.button>
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
                      <th className="w-6"></th>
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
                        return filteredAccounts.map(
                          (account: any, accIdx: number) => (
                            <tr
                              key={accIdx}
                              className="bg-white/[0.03] shadow-sm backdrop-blur-sm"
                            >
                              <td
                                className={`pl-8 py-3 text-[13px] font-medium cursor-pointer select-none touch-manipulation rounded-l-3xl border-l border-y border-white/5 transition-colors ${
                                  lastCopiedEmail === account.email
                                    ? "bg-green-500/10 text-green-400"
                                    : "bg-transparent text-white"
                                }`}
                                style={{ WebkitTapHighlightColor: "transparent" }}
                                onClick={() => handleAccountClick(account.email)}
                              >
                                <div className="flex items-center h-full">
                                  <motion.span
                                    key={
                                      copyStatus === account.email
                                        ? "active"
                                        : "idle"
                                    }
                                    initial={false}
                                    animate={{
                                      color:
                                        copyStatus === account.email
                                          ? "#12c83b"
                                          : "#e5e5e5",
                                      scale:
                                        copyStatus === account.email ? 1.05 : 1,
                                      fontWeight:
                                        copyStatus === account.email
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
                                const hasBoth = selectedItem.hasPS5 !== false && selectedItem.hasPS4 !== false;
                                
                                if (!hasBoth && i >= 3) return null;

                                const slotNamesArray = hasBoth 
                                  ? ["PS5 П3", "PS5 П3", "PS5 П2", "PS4 П3", "PS4 П2"] 
                                  : ["П3", "П3", "П2"];
                                const currentSlotName = slotNamesArray[i];

                                return (
                                  <td
                                    key={i}
                                    onClick={() => handleSlotClick(account.email, currentSlotName, i, slot.isOccupied)}
                                    className="py-3 text-center w-12 border-y border-white/5 cursor-pointer active:bg-white/10 transition-colors"
                                  >
                                    <div
                                      className={`w-7 h-7 rounded-full mx-auto flex items-center justify-center transition-all ${
                                        slot.isOccupied
                                          ? "bg-[#12c83b] shadow-[0_0_15px_rgba(18,200,59,0.4)]"
                                          : "bg-white/5 border border-white/10"
                                      }`}
                                    >
                                      {slot.isOccupied && (
                                        <Check
                                          size={16}
                                          strokeWidth={4}
                                          className="text-white"
                                        />
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="w-6 py-3 rounded-r-3xl border-r border-y border-white/5"></td>
                            </tr>
                          )
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
                  {isSubmittingEdition ? "..." : "Добавить"}
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
                  {isSubmittingAccount ? "..." : "Добавить"}
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

              <div className="mt-4 min-h-[120px] max-h-[50vh] overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-2">
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
                            <span className="text-sm font-semibold text-white leading-none">
                              {record.client || "Без имени"}
                            </span>
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

              <button
                onClick={handleToggleSlotState}
                disabled={isTogglingSlot}
                className={`mt-4 w-full py-3.5 rounded-2xl font-semibold text-[15px] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border ${
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
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400 active:scale-90 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

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
                          className="w-24 bg-[#121212] border border-green-500/40 rounded-lg px-3 py-1.5 text-[15px] text-white text-right outline-none"
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
    </>
  );
}