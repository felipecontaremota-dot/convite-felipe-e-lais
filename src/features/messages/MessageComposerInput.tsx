import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { Field, styles } from "../../components/ui";

// The input reserves the button's whole column, including when its text scrolls.
export function MessageComposerInput({
  label,
  hideLabel = true,
  placeholder,
  value,
  onChangeText,
  children,
}: {
  label: string;
  hideLabel?: boolean;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <View
      {...(Platform.OS === "web" ? { dataSet: { chatComposer: "true" } } : {})}
      style={{ position: "relative", minWidth: 0 }}
    >
      <Field
        label={label}
        hideLabel={hideLabel}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={4000}
        style={[
          styles.input,
          {
            height: 90,
            minHeight: 90,
            maxHeight: 120,
            paddingRight: 68,
            textAlignVertical: "top",
          },
        ]}
      />
      <View style={{ position: "absolute", right: 8, bottom: 8 }}>
        {children}
      </View>
    </View>
  );
}
