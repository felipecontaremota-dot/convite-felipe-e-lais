import { useId } from "react";
import { ActivityIndicator, Platform, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { theme } from "../../theme/tokens";
export function SendMessageButton({
  label = "Enviar mensagem",
  disabled = false,
  busy = false,
  onPress,
}: {
  label?: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const tooltipId = useId();
  const button = (
    <Pressable
      testID="chat-send"
      aria-describedby={Platform.OS === "web" ? tooltipId : undefined}
      accessibilityRole="button"
      accessibilityLabel={busy ? "Enviando mensagem" : label}
      aria-label={busy ? "Enviando mensagem" : label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        alignSelf: "flex-end",
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          disabled || busy ? theme.colors.disabled : theme.colors.primary,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden={true}>
          <Path
            d="M22 2 9 15M22 2l-7 20-6-7-7-6 20-7Z"
            fill="none"
            stroke={disabled ? theme.colors.disabledText : theme.colors.card}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </Pressable>
  );
  return (
    <>
      {Platform.OS === "web" ? (
        <style>{`
      [data-testid="chat-send"]{transition:background-color 180ms ease,transform 180ms ease;}
      [data-testid="chat-send"]:hover:not(:disabled){background:${theme.colors.primaryHover}!important;}
      [data-testid="chat-send"]:active:not(:disabled){transform:scale(.96);background:${theme.colors.primaryActive}!important;}
      [data-testid="chat-send"]:focus-visible{outline:3px solid ${theme.colors.focus};outline-offset:3px;}
      @media(prefers-reduced-motion:reduce){[data-testid="chat-send"]{transition:none;}}
    `}</style>
      ) : null}

      {Platform.OS === "web" ? (
        <>
          <style>{`.chat-action-tip-wrap{align-self:flex-end;display:inline-flex;position:relative}.chat-action-tip{position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);width:max-content;max-width:140px;padding:6px 10px;border-radius:8px;background:${theme.colors.ink};color:${theme.colors.card};font:12px/18px Arial,sans-serif;pointer-events:none;visibility:hidden;opacity:0;transition:opacity 160ms ease}.chat-action-tip-wrap:hover .chat-action-tip,.chat-action-tip-wrap:focus-within .chat-action-tip{visibility:visible;opacity:1}@media(prefers-reduced-motion:reduce){.chat-action-tip{transition:none}}`}</style>
          <span className="chat-action-tip-wrap">
            {button}
            <span id={tooltipId} role="tooltip" className="chat-action-tip">
              {label}
            </span>
          </span>
        </>
      ) : (
        button
      )}
    </>
  );
}
