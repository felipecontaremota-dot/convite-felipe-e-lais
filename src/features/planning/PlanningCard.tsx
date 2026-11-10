import { createElement, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { styles } from "../../components/ui";
import { theme } from "../../theme/tokens";
import { progressColor } from "./simpleDomain";

export function PlanningCardStyles() {
  return Platform.OS === "web"
    ? createElement(
        "style",
        null,
        `
      [data-planning-card]{transition:border-color .18s ease,box-shadow .18s ease;}
      .planning-card-action{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:inherit;background:transparent;cursor:pointer;z-index:1;}
      [data-planning-card]:has(>.planning-card-action:hover:not(:disabled)){border-color:${theme.colors.secondary};box-shadow:0 3px 12px ${theme.colors.shadow}12;}
      .planning-card-action:focus-visible{outline:3px solid ${theme.colors.focus};outline-offset:3px;}
      .planning-card-action:active:not(:disabled){background:${theme.colors.wash}55;}
      .planning-card-action:disabled{cursor:default;}
      [data-planning-progress-badge]{transition:background-color .6s linear,border-color .6s linear;}
      @media(prefers-reduced-motion:reduce){[data-planning-card],[data-planning-progress-badge]{transition:none!important;}}
    `,
      )
    : null;
}

// A stretched native button and the secondary action are siblings. There is no
// parent click handler, so cancellation cannot bubble into the edit action.
export function PlanningCard({
  children,
  secondary,
  label,
  onPress,
  disabled = false,
  kind,
}: {
  children: ReactNode;
  secondary?: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind: "supplier" | "payment";
}) {
  return (
    <View
      {...(Platform.OS === "web" ? { dataSet: { planningCard: kind } } : {})}
      style={[styles.card, { position: "relative" }]}
    >
      {Platform.OS === "web" ? (
        createElement("button", {
          type: "button",
          className: "planning-card-action",
          "aria-label": label,
          onClick: onPress,
          disabled,
        })
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => ({
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1,
            borderRadius: 18,
            backgroundColor: pressed ? `${theme.colors.wash}55` : "transparent",
          })}
        />
      )}
      {children}
      {secondary ? (
        <View style={{ zIndex: 2, alignSelf: "flex-start" }}>{secondary}</View>
      ) : null}
    </View>
  );
}

export function ProgressBadge({
  percent,
  vendor,
}: {
  percent: number;
  vendor: string;
}) {
  const color = progressColor(percent);
  const value = percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <Text
      accessibilityLabel={`${value}% do contrato de ${vendor} pago`}
      {...(Platform.OS === "web"
        ? { dataSet: { planningProgressBadge: "true" } }
        : {})}
      style={{
        flexShrink: 0,
        color: theme.colors.ink,
        backgroundColor: color.replace("rgb(", "rgba(").replace(")", ", 0.10)"),
        borderColor: color,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        fontSize: 14,
        fontWeight: "700",
      }}
    >
      {value}%
    </Text>
  );
}
