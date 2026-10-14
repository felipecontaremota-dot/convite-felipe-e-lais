import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { styles } from "../../components/ui";
import { InstallContext } from "./context";
import {
  getInstallSnapshot,
  getServerInstallSnapshot,
  subscribeInstall,
  consumeInstallPrompt,
  completeInstallPrompt,
  recordInstallFallback,
} from "./installBridge";

function ios() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
export function InstallProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getServerInstallSnapshot,
  );
  const [guidance, setGuidance] = useState<
    "ios" | "browser" | "accepted" | null
  >(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => () => invalidate(), [invalidate]);
  useEffect(() => {
    if (!snapshot.installed) return;
    const timer = setTimeout(() => setGuidance(null), 0);
    return () => clearTimeout(timer);
  }, [snapshot.installed]);
  const install = useCallback(() => {
    const current = getInstallSnapshot();
    if (current.installed || current.busy) return;
    const prompt = consumeInstallPrompt();
    if (!prompt) {
      recordInstallFallback();
      setGuidance(ios() ? "ios" : "browser");
      return;
    }
    const attempt = generation.current;
    // No async operation precedes prompt(): the native call retains click activation.
    void (async () => {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        completeInstallPrompt(choice.outcome);
        if (attempt !== generation.current || getInstallSnapshot().installed)
          return;
        if (choice.outcome === "accepted") setGuidance("accepted");
      } catch {
        completeInstallPrompt("error");
        if (attempt === generation.current && !getInstallSnapshot().installed) {
          recordInstallFallback();
          setGuidance(ios() ? "ios" : "browser");
        }
      }
    })();
  }, []);
  const value = useMemo(
    () => ({
      available: !snapshot.installed,
      busy: snapshot.busy,
      status: snapshot.status,
      promptAvailable: snapshot.promptAvailable,
      fallbackReason: snapshot.fallbackReason,
      install,
    }),
    [snapshot, install],
  );
  return (
    <InstallContext.Provider value={value}>
      {children}
      {guidance && !snapshot.installed ? (
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
