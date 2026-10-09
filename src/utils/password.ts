import * as Crypto from "expo-crypto";
export function generatePin() {
  const bytes = Crypto.getRandomBytes(2);
  return String(((bytes[0]! << 8) + bytes[1]!) % 10000).padStart(4, "0");
}
