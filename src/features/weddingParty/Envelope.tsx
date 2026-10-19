import { Pressable, Text, View } from "react-native";
export function Envelope({ onReveal }: { onReveal: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir convite especial"
      onPress={onReveal}
      style={{
        alignSelf: "center",
        width: "100%",
        maxWidth: 320,
        height: 200,
        backgroundColor: "#E3C997",
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          padding: 18,
          backgroundColor: "#18324F",
          borderWidth: 2,
          borderColor: "#D6BC78",
          borderRadius: 50,
        }}
      >
        <Text style={{ fontFamily: "Georgia", color: "#F4E6BD", fontSize: 28 }}>
          F&amp;L
        </Text>
      </View>
    </Pressable>
  );
}
