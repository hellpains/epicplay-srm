import {useState, useEffect} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {Menu, Search, Plus, Copy, User, LockKeyhole, Loader2} from "lucide-react";
import CatalogScreen from "./CatalogScreen";
import PriceSearchScreen from "./PriceSearchScreen";
import AddOrderModal from "./AddOrderModal";
import ActivityScreen from "./ActivityScreen";
import {API_URL, AUTH_EXPIRED_EVENT, SESSION_KEY, apiFetch} from "./config";
import {USDT_KEY, USDT_PRICE_KEY} from "./components/UsdtRate";
import {rub, useCdkDebts} from "./components/CdkDebts";
import GptAccounts from "./components/GptAccounts";
import PhoneTasks from "./components/PhoneTasks";

function AuthWall({onLoginSuccess}: { onLoginSuccess: (user: any) => void }) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isRegister, setIsRegister] = useState(false);
    // Регистрация — только по коду приглашения от администратора
    const [inviteCode, setInviteCode] = useState("");

    const handleLogin = async (e: any) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                body: JSON.stringify(
                    isRegister
                        ? {action: "register", login, password, code: inviteCode}
                        : {action: "login", login, password}
                ),
            });
            const data = await response.json();

            if (data.success) {
                const userData = {login: login.trim(), role: data.role, name: data.name, token: data.token};
                localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                onLoginSuccess(userData);
            } else {
                setError(data.message || (isRegister ? "Не удалось зарегистрироваться" : "Неверный логин или пароль"));
            }
        } catch (err) {
            setError("Ошибка сети. Проверьте интернет.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
        html, body { margin: 0; padding: 0; background: #121212; min-height: 100dvh; overscroll-behavior-y: none; }
      `}</style>

            <div className="fixed inset-0 z-[9999] bg-[#121212] flex flex-col items-center justify-center p-6">
                <div
                    className="w-20 h-20 rounded-full bg-[#1c1c1e] flex items-center justify-center mb-6 border border-white/5 shadow-2xl">
                    <LockKeyhole size={36} className="text-[#12c83b]"/>
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">
                    {isRegister ? "Регистрация" : "Авторизация"}
                </h2>

                <form
                    onSubmit={handleLogin}
                    className="flex flex-col items-center w-full max-w-xs gap-4"
                >
                    <input
                        type="text"
                        placeholder="Логин"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="username"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3.5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors"
                        required
                    />
                    <input
                        type="password"
                        placeholder="Пароль"
                        autoComplete={isRegister ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3.5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors"
                        required
                    />
                    {isRegister && (
                        <input
                            type="text"
                            placeholder="Код приглашения"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            autoComplete="off"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3.5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors"
                            required
                        />
                    )}

                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{opacity: 0, y: -10}}
                                animate={{opacity: 1, y: 0}}
                                exit={{opacity: 0}}
                                className="text-red-500 text-sm font-medium"
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={!login || !password || (isRegister && !inviteCode) || loading}
                        className="mt-4 w-full py-4 bg-[#12c83b] text-black font-bold rounded-xl active:scale-95 transition-all text-[16px] disabled:opacity-50"
                    >
                        {loading ? "Проверка..." : isRegister ? "Зарегистрироваться" : "Войти в систему"}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIsRegister(!isRegister);
                            setError("");
                        }}
                        className="text-sm text-neutral-400 active:text-white transition-colors"
                    >
                        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Регистрация"}
                    </button>
                </form>
            </div>
        </>
    );
}

const TemplatesScreen = () => (
    <div className="p-12 text-center text-neutral-500 pt-60 font-bold uppercase tracking-widest text-xs">
        Скоро
    </div>
);

// Раздел админа «Долги партнёров»: все сотрудники с ролью gpt и сколько каждый сейчас должен
function DebtorScreen({usdtRate, userLogin}: { usdtRate: number; userLogin: string }) {
    const debts = useCdkDebts(API_URL, usdtRate, "admin", userLogin);
    // Самый большой долг сверху
    const debtors = debts.gptLogins
        .map((login) => ({login, ...debts.debtOf(login)}))
        .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));

    return (
        <div className="px-6" style={{paddingTop: "calc(env(safe-area-inset-top, 24px) + 0.75rem)"}}>
            <div className="text-[28px] font-bold text-white tracking-tight">Долги партнёров</div>
            {!(usdtRate > 0) && (
                <div className="mt-2 text-[13px] text-amber-400">Курс USDT в шапке не задан — посчитать долг нельзя.</div>
            )}
            {debts.isLoading ? (
                debts.error ? (
                    <div className="py-6 text-center text-[13px] text-red-400">{debts.error}</div>
                ) : (
                    <div className="flex justify-center py-6">
                        <Loader2 size={20} className="animate-spin text-neutral-500"/>
                    </div>
                )
            ) : debtors.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-neutral-600">Должников пока нет</div>
            ) : (
                <div className="mt-4 flex flex-col gap-1.5">
                    {debtors.map((debtor) => (
                        <div
                            key={debtor.login}
                            className="px-4 py-3 rounded-[16px] bg-white/[0.04] border border-white/5 flex items-center justify-between gap-3"
                        >
                            <div className="min-w-0 truncate text-[15px] font-semibold text-white">{debtor.login}</div>
                            <div className="shrink-0 text-[15px] font-bold tabular-nums text-white">
                                {debtor.isPartial && "от "}
                                {rub(debtor.total)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <PhoneTasks apiUrl={API_URL}/>
            <GptAccounts apiUrl={API_URL}/>
        </div>
    );
}

export default function App() {
    // Сессия без токена (вход до появления авторизации на сервере) — просим войти заново
    const [authUser, setAuthUser] = useState<any>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
            return saved?.token ? saved : null;
        } catch {
            return null;
        }
    });

    const logout = () => {
        localStorage.removeItem(SESSION_KEY);
        setAuthUser(null);
    };

    useEffect(() => {
        window.addEventListener(AUTH_EXPIRED_EVENT, logout);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout);
    }, []);

    const [currentScreen, setCurrentScreen] = useState<string>("catalog");
    const [items, setItems] = useState<any[]>([]);
    const [variables, setVariables] = useState<any>({
        employees: [],
        paymentMethods: [],
        currencies: [],
    });

    const [_isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    const fetchItems = async (silent = false) => {
        if (!authUser) return;

        setIsSyncing(true);
        if (!silent) setIsLoading(true);

        try {
            const response = await apiFetch(API_URL);
            const data = await response.json();

            if (data.items) {
                const formattedData = data.items.map((item: any, index: number) => ({
                    ...item,
                    id: item.id || `${item.type}-${item.name}-${index}`,
                    title: item.title || item.name,
                }));

                localStorage.setItem("cached_games", JSON.stringify(formattedData));
                setItems(formattedData);

                if (selectedItem) {
                    const updatedSelected = formattedData.find(
                        (i: any) => i.name === selectedItem.name
                    );
                    if (updatedSelected) setSelectedItem(updatedSelected);
                }
            }

            if (data.variables) {
                setVariables(data.variables);
                localStorage.setItem("cached_vars", JSON.stringify(data.variables));
            }
        } catch (error) {
            console.error("Ошибка синхронизации:", error);
        } finally {
            setIsLoading(false);
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        if (!authUser) return;

        const cachedGames = localStorage.getItem("cached_games");
        const cachedVars = localStorage.getItem("cached_vars");

        if (cachedGames) setItems(JSON.parse(cachedGames));
        // Раздел «Пустые аккаунты» убран — старый кэш его списка больше не нужен
        localStorage.removeItem("cached_empty");
        if (cachedVars) setVariables(JSON.parse(cachedVars));

        fetchItems(!!cachedGames);
    }, [authUser]);

    useEffect(() => {
        if (!authUser) return;
        const syncInterval = setInterval(() => fetchItems(true), 60000);
        return () => clearInterval(syncInterval);
    }, [authUser]);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [currentScreen]);

    if (!authUser) {
        return <AuthWall onLoginSuccess={(user) => setAuthUser(user)}/>;
    }

    const profileInfo = (
        <div className="flex flex-col items-center gap-4">
            <div>
                Вы вошли как: <span className="text-white">{authUser.name} ({authUser.role})</span>
            </div>
            <button
                onClick={logout}
                className="px-6 py-2 bg-red-500/10 text-red-500 rounded-full border border-red-500/20 active:scale-95 transition-all"
            >
                Выйти из аккаунта
            </button>
        </div>
    );

    return (
        <div
            className="max-w-md mx-auto relative min-h-[100dvh] bg-[#121212] text-white font-sans overflow-x-hidden shadow-2xl pb-32">
            {currentScreen === "catalog" && (
                <CatalogScreen
                    items={items}
                    setItems={setItems}
                    isSyncing={isSyncing}
                    fetchItems={fetchItems}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    variables={variables}
                    API_URL={API_URL}
                    cdkOnly={authUser.role === "gpt"}
                    userRole={authUser.role}
                    userLogin={authUser.login ?? ""}
                />
            )}

            {currentScreen === "prices" && (
                <PriceSearchScreen
                    standardPrices={variables.standardPrices ?? {}}
                    onRatesSaved={() => fetchItems(true)}
                />
            )}

            {currentScreen === "templates" && (
                authUser.role === "admin" ? (
                    <DebtorScreen
                        usdtRate={Number(variables.standardPrices?.[USDT_KEY]?.[USDT_PRICE_KEY]) || 0}
                        userLogin={authUser.login ?? ""}
                    />
                ) : (
                    <TemplatesScreen/>
                )
            )}

            {currentScreen === "profile" && (
                authUser.role === "admin" ? (
                    <ActivityScreen
                        API_URL={API_URL}
                        variables={variables}
                        fetchItems={fetchItems}
                        footer={
                            <div
                                className="mt-10 pt-6 border-t border-white/5 text-center text-neutral-500 font-bold uppercase tracking-widest text-xs">
                                {profileInfo}
                            </div>
                        }
                    />
                ) : (
                    <div
                        className="p-10 text-center text-neutral-500 pt-60 font-bold uppercase tracking-widest text-xs">
                        {profileInfo}
                    </div>
                )
            )}

            <AnimatePresence>
                {currentScreen === "add_order" && (
                    <AddOrderModal
                        onClose={() => setCurrentScreen("catalog")}
                        gamesList={items}
                        variables={variables}
                        fetchItems={fetchItems}
                        API_URL={API_URL}
                    />
                )}
            </AnimatePresence>

            {!selectedItem && currentScreen !== "add_order" && (
                <>
                    <div
                        className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none z-30 max-w-md mx-auto"/>
                    <div
                        className="fixed bottom-0 left-0 right-0 h-28 z-40 max-w-md mx-auto pointer-events-auto touch-none"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                    <div className="fixed bottom-6 left-5 right-5 max-w-md mx-auto z-50">
                        <div
                            className="bg-[#1c1c1e]/90 backdrop-blur-2xl border border-white/10 rounded-full px-4 py-2 flex justify-between items-center shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
                            <NavButton
                                active={currentScreen === "catalog"}
                                icon={<Menu size={24}/>}
                                onClick={() => setCurrentScreen("catalog")}
                            />

                            <NavButton
                                active={currentScreen === "prices"}
                                icon={<Search size={24}/>}
                                onClick={() => setCurrentScreen("prices")}
                            />

                            <motion.button
                                whileTap={{scale: 0.85}}
                                onTap={() => setCurrentScreen("add_order")}
                                className="cursor-pointer touch-manipulation select-none w-12 h-12 flex items-center justify-center bg-[#12c83b] text-black rounded-full shadow-[0_0_15px_rgba(18,200,59,0.3)] shrink-0"
                                style={{WebkitTapHighlightColor: "transparent"}}
                            >
                                <Plus size={28} strokeWidth={2.5}/>
                            </motion.button>

                            <NavButton
                                active={currentScreen === "templates"}
                                icon={<Copy size={24}/>}
                                onClick={() => setCurrentScreen("templates")}
                            />
                            <NavButton
                                active={currentScreen === "profile"}
                                icon={<User size={24}/>}
                                onClick={() => setCurrentScreen("profile")}
                            />
                        </div>
                    </div>
                </>
            )}

            <style>{`
        html, body { margin: 0; padding: 0; background: #121212; min-height: 100dvh; overscroll-behavior-y: none; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .custom-scrollbar::-webkit-scrollbar { height: 4px; width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
        </div>
    );
}

function NavButton({active, icon, onClick}: any) {
    return (
        <motion.button
            whileTap={{scale: 0.75}}
            onTap={onClick}
            className={`w-12 h-12 flex items-center justify-center cursor-pointer touch-manipulation select-none rounded-full transition-colors ${
                active ? "text-white" : "text-neutral-500"
            }`}
            style={{WebkitTapHighlightColor: "transparent"}}
        >
            {icon}
        </motion.button>
    );
}