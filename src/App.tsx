import {useState, useEffect} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {Menu, Gamepad2, Plus, Copy, User, LockKeyhole} from "lucide-react";
import CatalogScreen from "./CatalogScreen";
import EmptyAccountsScreen from "./EmptyAccountsScreen";
import AddOrderModal from "./AddOrderModal";
import {API_URL} from "./config";

function AuthWall({onLoginSuccess}: { onLoginSuccess: (user: any) => void }) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: any) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                `${API_URL}?action=login&login=${encodeURIComponent(
                    login
                )}&password=${encodeURIComponent(password)}`
            );
            const data = await response.json();

            if (data.success) {
                const userData = {login, role: data.role, name: data.name};
                localStorage.setItem("app_auth_session", JSON.stringify(userData));
                onLoginSuccess(userData);
            } else {
                setError(data.message || "Неверный логин или пароль");
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
                    Авторизация
                </h2>

                <form
                    onSubmit={handleLogin}
                    className="flex flex-col items-center w-full max-w-xs gap-4"
                >
                    <input
                        type="text"
                        placeholder="Логин"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3.5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors"
                        required
                    />
                    <input
                        type="password"
                        placeholder="Пароль"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3.5 text-[16px] text-white outline-none focus:border-[#12c83b]/50 transition-colors"
                        required
                    />

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
                        disabled={!login || !password || loading}
                        className="mt-4 w-full py-4 bg-[#12c83b] text-black font-bold rounded-xl active:scale-95 transition-all text-[16px] disabled:opacity-50"
                    >
                        {loading ? "Проверка..." : "Войти в систему"}
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

export default function App() {
    const [authUser, setAuthUser] = useState<any>(() => {
        const saved = localStorage.getItem("app_auth_session");
        return saved ? JSON.parse(saved) : null;
    });

    const [currentScreen, setCurrentScreen] = useState<string>("catalog");
    const [items, setItems] = useState<any[]>([]);
    const [emptyAccounts, setEmptyAccounts] = useState<any[]>([]);
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
            const response = await fetch(API_URL);
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

            if (data.emptyAccounts) {
                setEmptyAccounts(data.emptyAccounts);
                localStorage.setItem(
                    "cached_empty",
                    JSON.stringify(data.emptyAccounts)
                );
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
        const cachedEmpty = localStorage.getItem("cached_empty");
        const cachedVars = localStorage.getItem("cached_vars");

        if (cachedGames) setItems(JSON.parse(cachedGames));
        if (cachedEmpty) setEmptyAccounts(JSON.parse(cachedEmpty));
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

    return (
        <div
            className="max-w-md mx-auto relative min-h-[100dvh] bg-[#121212] text-white font-sans overflow-x-hidden shadow-2xl pb-32">
            {currentScreen === "catalog" && currentScreen !== "add_order" && (
                <CatalogScreen
                    items={items}
                    setItems={setItems}
                    isSyncing={isSyncing}
                    fetchItems={fetchItems}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    variables={variables}
                    API_URL={API_URL}
                />
            )}

            {currentScreen === "empty" && currentScreen !== "add_order" && (
                <EmptyAccountsScreen
                    emptyAccounts={emptyAccounts}
                    setEmptyAccounts={setEmptyAccounts}
                    API_URL={API_URL}
                    isSyncing={isSyncing}
                    fetchItems={fetchItems}
                    variables={variables}
                />
            )}

            {currentScreen === "templates" && currentScreen !== "add_order" && (
                <TemplatesScreen/>
            )}

            {currentScreen === "profile" && currentScreen !== "add_order" && (
                <div
                    className="p-10 text-center text-neutral-500 pt-60 font-bold uppercase tracking-widest text-xs flex flex-col items-center gap-4">
                    <div>
                        Вы вошли как: <span className="text-white">{authUser.name} ({authUser.role})</span>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.removeItem("app_auth_session");
                            setAuthUser(null);
                        }}
                        className="px-6 py-2 bg-red-500/10 text-red-500 rounded-full border border-red-500/20 active:scale-95 transition-all"
                    >
                        Выйти из аккаунта
                    </button>
                </div>
            )}

            <AnimatePresence>
                {currentScreen === "add_order" && (
                    <AddOrderModal
                        onClose={() => setCurrentScreen("catalog")}
                        gamesList={items}
                        emptyAccounts={emptyAccounts}
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
                                active={currentScreen === "empty"}
                                icon={<Gamepad2 size={24}/>}
                                onClick={() => setCurrentScreen("empty")}
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