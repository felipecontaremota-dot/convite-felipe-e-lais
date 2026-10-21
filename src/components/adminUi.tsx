import { feedbackColors, type FeedbackTone } from "../theme/feedback";
import { theme } from "../theme/tokens";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button, Card, styles } from "./ui";
const paths = {
  edit: "M4 16v4h4L20 8l-4-4L4 16zm10-10 4 4",
  delete: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6",
  add: "M8 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M4 21v-3a7 7 0 0 1 14 0M20 4v6m-3-3h6",
  send: "M3 5h18v14H3zM3 5l9 7 9-7",
  remove: "M7 7l10 10M17 7L7 17",
  note: "M12 3v11m0 4v2",
} as const;
export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof paths;
  label: string;
  onPress: () => void | Promise<unknown>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.nav, { padding: 10 }]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
        <Path
          d={paths[icon]}
          fill="none"
          stroke={theme.colors.secondary}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
export function SelectionCheckbox({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={onPress}
      style={[styles.nav, { padding: 10 }, value && styles.selected]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
        <Path
          d="M4 4h16v16H4z"
          fill="none"
          stroke={theme.colors.secondary}
          strokeWidth={1.5}
        />
        {value ? (
          <Path
            d="m7 12 3 3 7-7"
            fill="none"
            stroke={theme.colors.secondary}
            strokeWidth={2}
          />
        ) : null}
      </Svg>
    </Pressable>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
  tone = "neutral",
}: {
  compact?: boolean;
  disabled?: boolean;
  tone?: FeedbackTone;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === "web") {
    const select = React.createElement(
      "select",
      {
        "aria-label": label,
        title: compact ? "Alterar confirmação de presença" : undefined,
        disabled,
        value,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value),
        style: {
          minHeight: 48,
          border: `1px solid ${theme.colors.inputBorder}`,
          borderRadius: 10,
          padding: 12,
          color: theme.colors.ink,
          backgroundColor: theme.colors.card,
          fontSize: 16,
          width: "100%",
          maxWidth: "100%",
          ...(compact
            ? {
                position: "absolute" as const,
                inset: 0,
                height: "100%",
                minHeight: 0,
                minWidth: 0,
                boxSizing: "border-box" as const,
                appearance: "none" as const,
                WebkitAppearance: "none" as const,
                MozAppearance: "none" as const,
                backgroundImage: "none",
                borderRadius: 6,
                padding: "3px 8px",
                fontFamily:
                  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
                fontSize: 13,
                lineHeight: "20px",
                fontWeight: 400,
                backgroundColor: feedbackColors[tone].background,
                color: feedbackColors[tone].text,
                borderColor: feedbackColors[tone].border,
                cursor: disabled ? "wait" : "pointer",
              }
            : {}),
        },
      },
      options.map((o) =>
        React.createElement(
          "option",
          { key: o.value, value: o.value },
          o.label,
        ),
      ),
    );
    return (
      <View style={{ gap: 6, maxWidth: "100%" }}>
        {!compact && <Text style={styles.small}>{label}</Text>}
        {compact ? (
          <View
            style={{
              position: "relative",
              alignSelf: "flex-start",
              maxWidth: "100%",
            }}
          >
            {/* Size to the current label, without the native arrow or longest-option gutter. */}
            <View
              aria-hidden={true}
              pointerEvents="none"
              style={{ opacity: 0 }}
            >
              <Tag tone={tone}>
                {options.find((o) => o.value === value)?.label}
              </Tag>
            </View>
            {select}
          </View>
        ) : (
          select
        )}
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={compact ? undefined : styles.nav}
      >
        {compact ? (
          <Tag tone={tone}>{options.find((o) => o.value === value)?.label}</Tag>
        ) : (
          <>
            <Text style={styles.small}>{label}</Text>
            <Text style={styles.text}>
              {options.find((o) => o.value === value)?.label || "Selecionar"}
            </Text>
          </>
        )}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: theme.colors.overlaySoft,
          }}
        >
          <ScrollView
            style={{ maxHeight: "85%" }}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              {options.map((o) => (
                <Button
                  key={o.value}
                  secondary
                  title={o.label}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                />
              ))}
              <Button title="Cancelar" onPress={() => setOpen(false)} />
            </Card>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
export { ConfirmModal as Confirmation } from "./AdminModal";
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: FeedbackTone;
}) {
  const colors = feedbackColors[tone];
  return (
    <Text
      style={[
        styles.small,
        {
          backgroundColor: colors.background,
          color: colors.text,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
      ]}
    >
      {children}
    </Text>
  );
}
