import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme/tokens";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { friendlyError } from "../lib/errors";
import { Button, styles } from "./ui";

// Reference counts keep the page inert when nested dialogs close in either order.
const hiddenRoots = new WeakMap<
  HTMLElement,
  { count: number; inert: boolean; aria: string | null }
>();
function hideRoot(node: HTMLElement) {
  const state = hiddenRoots.get(node) || {
    count: 0,
    inert: node.inert,
    aria: node.getAttribute("aria-hidden"),
  };
  state.count++;
  hiddenRoots.set(node, state);
  node.inert = true;
  node.setAttribute("aria-hidden", "true");
  return () => {
    state.count--;
    if (state.count === 0) {
      node.inert = state.inert;
      if (state.aria === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", state.aria);
      hiddenRoots.delete(node);
    }
  };
}
export function AdminModal({
  title,
  children,
  onClose,
  dismissible = true,
  closeOnOutside = true,
  premium = false,
  centerTitle = false,
  closing = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  closeOnOutside?: boolean;
  premium?: boolean;
  centerTitle?: boolean;
  closing?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [premiumScale] = useState(() => new Animated.Value(premium ? 0.2 : 1));
  const [premiumOpacity] = useState(() => new Animated.Value(premium ? 0 : 1));
  useEffect(() => {
    if (!premium || Platform.OS === "web") return;
    let animation: Animated.CompositeAnimation | undefined;
    let active = true;
    void import("react-native").then(async ({ AccessibilityInfo }) => {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled();
      if (!active) return;
      animation = Animated.parallel([
        reduced
          ? Animated.timing(premiumScale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            })
          : Animated.spring(premiumScale, {
              toValue: closing ? 0.98 : 1,
              stiffness: 120,
              damping: 17,
              mass: 0.7,
              useNativeDriver: true,
            }),
        Animated.timing(premiumOpacity, {
          toValue: closing ? 0 : 1,
          duration: reduced ? 0 : 200,
          useNativeDriver: true,
        }),
      ]);
      animation.start();
    });
    return () => {
      active = false;
      animation?.stop();
    };
  }, [premium, closing, premiumScale, premiumOpacity]);
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const attach = useCallback((node: View | null) => {
    if (Platform.OS === "web") setDialog(node as unknown as HTMLElement | null);
  }, []);
  const callbacks = useRef({ onClose, dismissible });
  useEffect(() => {
    callbacks.current = { onClose, dismissible };
  }, [onClose, dismissible]);
  useEffect(() => {
    if (Platform.OS !== "web" || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog;
    let portal: HTMLElement = node;
    while (portal.parentElement && portal.parentElement !== document.body)
      portal = portal.parentElement;
    const restoreRoots = Array.from(document.body.children)
      .filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement &&
          el !== portal &&
          !["SCRIPT", "STYLE", "LINK"].includes(el.tagName),
      )
      .map(hideRoot);
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input, select, textarea, [tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length);
    const timer = setTimeout(() => (focusables()[0] || node)?.focus(), 0);
    const handle = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-admin-modal="true"]');
      if (dialogs[dialogs.length - 1] !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (callbacks.current.dismissible) callbacks.current.onClose();
      }
      if (event.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          node?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !node?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !node?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handle);
      restoreRoots.forEach((restore) => restore());
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus();
    };
  }, [dialog]);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <KeyboardAvoidingView
        enabled={premium && Platform.OS === "ios"}
        behavior={premium && Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: width < 600 ? 10 : 24,
          ...(premium
            ? {
                paddingTop: Math.max(insets.top, width < 600 ? 10 : 24),
                paddingBottom: Math.max(insets.bottom, width < 600 ? 10 : 24),
              }
            : {}),
        }}
      >
        <Pressable
          accessibilityLabel="Fechar ao clicar fora"
          accessible={false}
          onPress={() => {
            if (dismissible && closeOnOutside) onClose();
          }}
          style={{ position: "absolute", inset: 0 }}
        />
        <Animated.View
          ref={attach}
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={title}
          {...(Platform.OS === "web"
            ? {
                dataSet: {
                  adminModal: "true",
                  premiumModal: premium
                    ? closing
                      ? "closing"
                      : "open"
                    : undefined,
                },
              }
            : {})}
          tabIndex={-1}
          style={[
            styles.card,
            premium && Platform.OS !== "web"
              ? {
                  opacity: premiumOpacity,
                  transform: [
                    { scaleX: premiumScale },
                    {
                      scaleY: premiumScale.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1],
                      }),
                    },
                  ],
                }
              : undefined,
            {
              width: "100%",
              maxWidth: 760,
              maxHeight: "94%",
              padding: width < 600 ? 16 : 24,
            },
          ]}
        >
          <View style={styles.row}>
            <Text
              accessibilityRole="header"
              style={[
                styles.heading,
                { flex: 1 },
                centerTitle && { fontWeight: "700" },
                (premium || centerTitle) && {
                  textAlign: "center",
                  paddingHorizontal: 44,
                },
              ]}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar modal"
              disabled={!dismissible}
              onPress={onClose}
              style={[
                styles.nav,
                (premium || centerTitle) && {
                  position: "absolute",
                  right: 0,
                  top: 0,
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                },
                premium && {
                  alignSelf: "flex-start",
                  borderWidth: 0,
                  backgroundColor: "transparent",
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={styles.text}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 12 }}
            style={{ flexShrink: 1 }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function ConfirmModal({
  text,
  onConfirm,
  onCancel,
  confirmLabel = "Excluir",
  destructive = true,
}: {
  text: string;
  onConfirm: () => Promise<unknown>;
  onCancel: () => void;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <AdminModal
      title="Confirmação"
      onClose={onCancel}
      dismissible={!busy}
      closeOnOutside={false}
    >
      <Text accessibilityRole="alert" style={styles.text}>
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await onConfirm();
          } catch (failure) {
            setError(friendlyError(failure));
          } finally {
            setBusy(false);
          }
        }}
        style={[
          styles.button,
          destructive && { backgroundColor: theme.colors.destructive },
          busy && { opacity: 0.5 },
        ]}
      >
        <Text style={{ color: theme.colors.card, fontWeight: "600" }}>
          {busy ? "Aguarde…" : confirmLabel}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button secondary title="Cancelar" disabled={busy} onPress={onCancel} />
    </AdminModal>
  );
}
export function SelectedChips({
  items,
  onRemove,
  onClear,
}: {
  items: { id: string; name: string }[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Remover seleção de ${item.name}`}
          onPress={() => onRemove(item.id)}
          style={[styles.nav, styles.selected]}
        >
          <Text style={styles.text}>{item.name} ×</Text>
        </Pressable>
      ))}
      {items.length > 1 ? (
        <Button secondary title="Limpar seleção" onPress={onClear} />
      ) : null}
    </View>
  );
}
