import React from "react";
import { Image, Platform, Pressable } from "react-native";
import { openExternal } from "../../utils/externalLinks";
export function VenueLogo() {
  const children = (
    <Image
      source={require("../../../assets/villarejo-eventos.jpg")}
      accessible
      accessibilityLabel="Villarejo Eventos"
      resizeMode="cover"
      style={{ width: 112, height: 112, borderRadius: 56, alignSelf: "center" }}
    />
  );
  const url =
    "https://www.instagram.com/villarejoeventos?vrfl=M2tpa292Nzc5bDBz";
  const label = "Visitar o Instagram do Villarejo Eventos";
  const [hovered, setHovered] = React.useState(false);
  const style = {
    alignSelf: "center" as const,
    width: 112,
    height: 112,
    borderRadius: 56,
    opacity: hovered ? 0.85 : 1,
  };
  if (Platform.OS === "web")
    return React.createElement(
      "a",
      {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": label,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        style: { ...style, display: "block" },
        role: "link",
      },
      children,
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => openExternal(url)}
      style={style}
    >
      {children}
    </Pressable>
  );
}
