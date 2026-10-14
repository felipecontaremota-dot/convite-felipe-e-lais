import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { styles } from "../../components/ui";
import { InstallContext } from "./context";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
function standalone() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}
function ios() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
export function InstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(standalone);
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState<
    "ios" | "browser" | "accepted" | null
  >(null);
  const deferred = useRef<InstallPrompt | null>(null);
  const locked = useRef(false);
  const installedRef = useRef(installed);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const onInstalled = () => {
      installedRef.current = true;
      deferred.current = null;
      setInstalled(true);
      setGuidance(null);
    };
    const onDisplay = () => {
      if (standalone()) onInstalled();
      else {
        installedRef.current = false;
        setInstalled(false);
      }
    };
    const onPrompt = (event: Event) => {
      if (installedRef.current) return;
      // Deferring prevents an unsolicited prompt; only the explicit action opens it.
      event.preventDefault();
      deferred.current = event as InstallPrompt;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", onDisplay);
    return () => {
      invalidate();
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", onDisplay);
    };
  }, [invalidate]);
  const install = useCallback(() => {
    if (installedRef.current || locked.current) return;
    const prompt = deferred.current;
    if (!prompt) {
      setGuidance(ios() ? "ios" : "browser");
      return;
    }
    deferred.current = null; // Native prompt events are single-use, including dismissals/errors.
    locked.current = true;
    setBusy(true);
    const attempt = generation.current;
    // Called synchronously inside the click handler to retain user activation.
    void (async () => {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (attempt !== generation.current || installedRef.current) return;
        if (choice.outcome === "accepted") setGuidance("accepted");
      } catch {
        if (attempt === generation.current && !installedRef.current)
          setGuidance(ios() ? "ios" : "browser");
      } finally {
        locked.current = false;
        if (attempt === generation.current) setBusy(false);
      }
    })();
  }, []);
  const value = useMemo(
    () => ({ available: !installed, busy, install }),
    [installed, busy, install],
  );
  return (
    <InstallContext.Provider value={value}>
      {children}
      {guidance ? (
        <AdminModal
          title={
            guidance === "accepted"
              ? "Instalação solicitada"
              : "Instale este convite como app"
          }
          onClose={() => setGuidance(null)}
        >
          {guidance === "ios" ? (
            <>
              <Text style={styles.text}>
                1. Toque no botão Compartilhar do navegador.
              </Text>
              <Text style={styles.text}>
                2. Escolha “Adicionar à Tela de Início”.
              </Text>
              <Text style={styles.text}>3. Confirme em “Adicionar”.</Text>
            </>
          ) : (
            <Text style={styles.text}>
              {guidance === "accepted"
                ? "A instalação foi solicitada ao navegador. Aguarde a confirmação para abrir o convite como app."
                : "Para instalar este convite, abra o menu do navegador e procure por “Instalar aplicativo” ou “Adicionar à tela inicial”. A disponibilidade depende do navegador utilizado."}
            </Text>
          )}
        </AdminModal>
      ) : null}
    </InstallContext.Provider>
  );
}
