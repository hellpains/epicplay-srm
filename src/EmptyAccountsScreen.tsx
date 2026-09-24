import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { Copy, Check, RotateCw, Gamepad2, Trash2, X, Plus } from "lucide-react";

export default function EmptyAccountsScreen({
  emptyAccounts = [],
  setEmptyAccounts,
  isSyncing,
  fetchItems,
  variables = { regions: [] },
  API_URL,
}: any) {
  
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const [accountToConfirm, setAccountToConfirm] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  const REGIONS = variables.regions?.length
    ? variables.regions
    : [
        { code: "UKR", emoji: "🇺🇦" },
        { code: "TUR", emoji: "🇹🇷" },
      ];

  const sortedRegions = useMemo(() => {
    const baseRegions = REGIONS.map((regionItem: any) => {
      const count = emptyAccounts.filter(
        (acc: any) => acc?.region === regionItem.code && !acc.isProblem
      ).length;
      return { ...regionItem, count };
    }).sort((a: any, b: any) => b.count - a.count);

    const trashCount = emptyAccounts.filter((acc: any) => acc?.isProblem).length;
    baseRegions.push({ code: "Корзина", count: trashCount });

    return baseRegions;
  }, [REGIONS, emptyAccounts]);

  const [activeRegion, setActiveRegion] = useState(
    sortedRegions[0]?.code || "UKR"
  );

  useEffect(() => {
    if (
      sortedRegions.length > 0 &&
      !sortedRegions.find((r: any) => r.code === activeRegion)
    ) {
      setActiveRegion(sortedRegions[0].code);
    }
  }, [sortedRegions, activeRegion]);

  const handleCopy = (email: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopyStatus(email);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const handleMarkProblem = async (email: string) => {
    if (setEmptyAccounts) {
      setEmptyAccounts((prev: any[]) =>
        prev.map((acc: any) =>
          acc.email === email ? { ...acc, isProblem: true } : acc
        )
      );
    }
    setSwipedItemId(null);
    if (API_URL) {
      try {
        await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "markProblem", email: email }),
        });
      } catch (error) {
        console.error("Ошибка при переносе в корзину:", error);
      }
    }
  };

  const handleRestoreProblem = async (email: string) => {
    if (setEmptyAccounts) {
      setEmptyAccounts((prev: any[]) =>
        prev.map((acc: any) =>
          acc.email === email ? { ...acc, isProblem: false } : acc
        )
      );
    }
    if (API_URL) {
      try {
        await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "unmarkProblem", email: email }),
        });
      } catch (error) {
        console.error("Ошибка при восстановлении:", error);
      }
    }
  };

  const openAddModal = () => {
    setNewEmail("");
    setAddError("");
    setNewRegion(
      activeRegion !== "Корзина" ? activeRegion : REGIONS[0]?.code || ""
    );
    setShowAddModal(true);
  };

  const handleAddAccount = async () => {
    const email = newEmail.trim();
    if (!email) {
      setAddError("Введите почту");
      return;
    }
    if (!newRegion) {
      setAddError("Выберите регион");
      return;
    }

    setIsSubmitting(true);
    setAddError("");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addEmptyAccount",
          email,
          region: newRegion,
        }),
      });
      const result = await response.json();

      if (result.success) {
        if (setEmptyAccounts) {
          setEmptyAccounts((prev: any[]) => {
            const filtered = prev.filter(
              (a: any) => a.email?.toLowerCase() !== email.toLowerCase()
            );
            return [
              ...filtered,
              {
                email,
                region: newRegion.toUpperCase(),
                isProblem: false,
              },
            ];
          });
        }
        setActiveRegion(newRegion.toUpperCase());
        setShowAddModal(false);
        setNewEmail("");
        setIsSubmitting(false);
        fetchItems(true);
      } else {
        setAddError(result.error || "Ошибка при добавлении");
        setIsSubmitting(false);
      }
    } catch (e) {
      console.error(e);
      setAddError("Ошибка сети");
      setIsSubmitting(false);
    }
  };

  let filteredAccounts: any[] = [];
  if (activeRegion === "Корзина") {
    filteredAccounts = emptyAccounts
      .filter((acc: any) => acc?.isProblem)
      .sort((a: any, b: any) => a.region.localeCompare(b.region));
  } else {
    filteredAccounts = emptyAccounts.filter(
      (acc: any) => acc?.region === activeRegion && !acc.isProblem
    );
  }

  const groupedTrash = useMemo(() => {
    if (activeRegion !== "Корзина") return null;
    return filteredAccounts.reduce((acc: any, current: any) => {
      (acc[current.region] = acc[current.region] || []).push(current);
      return acc;
    }, {});
  }, [filteredAccounts, activeRegion]);

  return (
    <div
      className="flex flex-col h-[100dvh] bg-[#121212] overflow-hidden"
      onClick={() => setSwipedItemId(null)}
    >
      <div className="shrink-0 z-40 bg-[#1a1a1a]/90 backdrop-blur-xl border-b border-white/5 pb-2 rounded-b-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto relative">
        <div
          className="relative flex items-center px-6 justify-between"
          style={{
            height: "calc(4rem + env(safe-area-inset-top, 24px))",
            paddingTop: "calc(env(safe-area-inset-top, 24px) + 0.5rem)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
              <Gamepad2 size={16} className="text-white" />
            </div>
            <h1 className="text-xl font-medium tracking-[0.02em] text-white">
              Пустые аккаунты
            </h1>
          </div>

          <button
            onClick={() => fetchItems(false)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-white/10 bg-black/20 backdrop-blur-md active:scale-90 transition-all shadow-lg"
          >
            <RotateCw
              size={18}
              className={
                isSyncing ? "animate-spin text-green-500" : "text-white"
              }
            />
          </button>
        </div>

        <div className="mt-1 w-full">
          <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
          <div className="flex overflow-x-auto hide-scrollbar touch-pan-x pl-6 pt-3 pb-3">
            {sortedRegions.map((regionItem: any) => {
              const region = regionItem.code;
              const hasAccounts = regionItem.count > 0;
              const isActive = activeRegion === region;
              const isTrash = region === "Корзина";

              return (
                <div key={region} className="flex items-center shrink-0">
                  {isTrash && (
                    <div className="w-[2px] h-7 bg-white/10 ml-1 mr-4 rounded-full shrink-0" />
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRegion(region);
                      setSwipedItemId(null);
                    }}
                    className={`shrink-0 flex items-center justify-center gap-1.5 mr-2.5 py-2.5 rounded-[14px] font-black uppercase tracking-widest transition-all duration-300 border ${
                      isTrash ? "w-[64px]" : "w-[104px] text-[11px]"
                    } ${
                      isActive
                        ? isTrash
                          ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)] scale-105"
                          : "bg-white text-black border-white shadow-lg scale-105"
                        : hasAccounts
                        ? isTrash
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : "bg-white/5 text-white/90 border-white/10"
                        : "bg-transparent text-neutral-600 border-white/5 opacity-50"
                    }`}
                  >
                    {isTrash ? (
                      <Trash2 size={20} strokeWidth={2.5} />
                    ) : (
                      <>
                        <span className="text-[14px] leading-none mb-[1px]">
                          {regionItem.emoji}
                        </span>
                        <span>{region}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            <div className="shrink-0 w-3" />
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar px-6 pt-6 pb-40">
        {activeRegion !== "Корзина" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openAddModal();
            }}
            className="w-full mb-4 flex items-center justify-center gap-2 py-3.5 border border-green-500/30 bg-green-500/5 rounded-2xl text-white active:scale-95 transition-all"
          >
            <Plus size={18} className="text-green-500" />
            <span className="text-[14px] font-semibold">Добавить аккаунт</span>
          </button>
        )}

        <AnimatePresence mode="popLayout">
          {filteredAccounts.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeRegion === "Корзина" ? (
                Object.entries(groupedTrash).map(([regionName, accounts]: any) => (
                  <div key={regionName} className="mb-4">
                    <span className="text-[12px] text-neutral-500 font-semibold tracking-[0.05em] ml-2 block mb-3">
                      Регион {regionName}
                    </span>
                    <div className="flex flex-col gap-3">
                      {accounts.map((acc: any) => (
                        <SwipeableAccountItem
                          key={acc.email}
                          email={acc.email}
                          region={acc.region}
                          isCopied={copyStatus === acc.email}
                          isTrashView={true}
                          isSwiped={false}
                          onSwipeStart={() => {}}
                          onCopy={() => handleCopy(acc.email)}
                          onMarkProblem={() => {}}
                          onRestore={() => setAccountToConfirm(acc.email)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="mb-2">
                    <span className="text-[12px] text-neutral-500 font-semibold tracking-[0.05em] ml-2">
                      Доступно {activeRegion}: {filteredAccounts.length}
                    </span>
                  </div>
                  {filteredAccounts.map((acc: any) => (
                    <SwipeableAccountItem
                      key={acc.email}
                      email={acc.email}
                      region={acc.region}
                      isCopied={copyStatus === acc.email}
                      isTrashView={false}
                      isSwiped={swipedItemId === acc.email}
                      onSwipeStart={() => setSwipedItemId(acc.email)}
                      onCopy={() => {
                        handleCopy(acc.email);
                        setSwipedItemId(null);
                      }}
                      onMarkProblem={() => handleMarkProblem(acc.email)}
                      onRestore={() => {}}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="mt-16 flex flex-col items-center justify-center text-center text-neutral-500"
            >
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                {activeRegion === "Корзина" ? (
                  <Trash2 size={24} className="opacity-30" />
                ) : (
                  <Check size={24} className="opacity-20" />
                )}
              </div>
              <p className="text-sm">Нет аккаунтов в {activeRegion}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {accountToConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setAccountToConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative bg-[#1a1a1c] border border-white/10 rounded-[28px] p-6 w-full max-w-[280px] shadow-3xl flex flex-col items-center text-center"
            >
              <h3 className="text-xl font-semibold text-white mb-2 tracking-[0.01em]">
                Убрать из корзины?
              </h3>

              <p className="text-sm text-neutral-500 mb-7 break-all px-2 leading-tight">
                {accountToConfirm}
              </p>

              <div className="flex w-full gap-3">
                <button
                  onClick={() => {
                    handleRestoreProblem(accountToConfirm);
                    setAccountToConfirm(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-white/70 text-black font-bold active:scale-95 transition-all hover:bg-white/90 shadow-[0_4px_15px_rgba(255,255,255,0.05)]"
                >
                  Да
                </button>
                <button
                  onClick={() => setAccountToConfirm(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-neutral-400 font-medium active:scale-95 transition-all hover:bg-white/10"
                >
                  Нет
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative bg-[#1a1a1c] border border-white/10 rounded-[28px] p-6 w-full max-w-xs shadow-2xl flex flex-col"
            >
              <h3 className="text-[18px] font-semibold text-white mb-5 tracking-tight">
                Новый аккаунт
              </h3>

              <label className="text-[13px] text-neutral-400 pl-1 mb-1.5">
                Почта
              </label>
              <input
                autoFocus
                type="text"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setAddError("");
                }}
                placeholder="example@email.com"
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white mb-4 outline-none focus:border-green-500/50 transition-colors placeholder:text-neutral-600"
              />

              <label className="text-[13px] text-neutral-400 pl-1 mb-1.5">
                Регион
              </label>
              <select
                value={newRegion}
                onChange={(e) => {
                  setNewRegion(e.target.value);
                  setAddError("");
                }}
                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-[15px] text-white mb-4 outline-none focus:border-green-500/50 transition-colors appearance-none"
              >
                {REGIONS.map((r: any) => (
                  <option key={r.code} value={r.code}>
                    {r.emoji ? `${r.emoji} ${r.code}` : r.code}
                  </option>
                ))}
              </select>

              {addError && (
                <p className="text-red-400 text-[13px] mb-4 text-center">
                  {addError}
                </p>
              )}

              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3.5 text-neutral-400 font-semibold rounded-xl transition-all text-[15px]"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddAccount}
                  disabled={isSubmitting || !newEmail.trim()}
                  className="flex-1 py-3.5 bg-[#12c83b] text-black font-semibold rounded-xl active:scale-95 transition-all disabled:opacity-50 text-[15px]"
                >
                  {isSubmitting ? "..." : "Добавить"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwipeableAccountItem({
  email,
  region,
  isCopied,
  isTrashView,
  isSwiped,
  onSwipeStart,
  onCopy,
  onMarkProblem,
  onRestore,
}: any) {
  const controls = useAnimation();

  useEffect(() => {
    if (!isSwiped && !isTrashView) {
      controls.start({ x: 0 });
    }
  }, [isSwiped, isTrashView, controls]);

  if (isTrashView) {
    return (
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#1c1c1e] border border-red-500/20 shadow-md">
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-medium tracking-wide truncate pr-4 text-red-400 line-through">
            {email}
          </span>
          <span className="text-[10px] text-neutral-500 uppercase mt-0.5 tracking-wider">
            {region}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-all hover:bg-white/10"
          >
            <X size={14} className="text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors active:scale-90 hover:bg-white/10 ${
              isCopied ? "bg-[#12c83b]/20" : "bg-white/5"
            }`}
          >
            {isCopied ? (
              <Check size={14} className="text-[#12c83b]" />
            ) : (
              <Copy size={14} className="text-neutral-400" />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className="relative w-full shadow-md"
    >
      <div className="absolute inset-y-[2px] right-[2px] w-[90px] bg-red-500 rounded-xl flex items-center justify-end px-4 z-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMarkProblem();
          }}
          className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Trash2 className="text-white" size={20} />
        </button>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -75, right: 0 }}
        dragElastic={0.1}
        animate={controls}
        onDragStart={() => {
          onSwipeStart();
        }}
        onDragEnd={(_e, info) => {
          if (info.offset.x < -30 || info.velocity.x < -300) {
            onSwipeStart();
            controls.start({ x: -75 });
          } else {
            controls.start({ x: 0 });
          }
        }}
        className={`relative z-10 flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-colors ${
          isCopied
            ? "bg-[#172b1d] border border-[#12c83b]/40"
            : "bg-[#1c1c1e] border border-white/5"
        }`}
      >
        <div
          className="flex flex-1 items-center overflow-hidden"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          <span
            className={`text-sm font-medium tracking-wide truncate pr-4 transition-colors ${
              isCopied ? "text-[#12c83b]" : "text-neutral-200"
            }`}
          >
            {email}
          </span>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
            isCopied
              ? "bg-[#12c83b] shadow-[0_0_15px_rgba(18,200,59,0.4)]"
              : "bg-white/5"
          }`}
        >
          {isCopied ? (
            <Check size={16} strokeWidth={3} className="text-white" />
          ) : (
            <Copy size={14} className="text-neutral-400" />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}