import { describe, it, expect, vi, beforeEach } from "vitest";
import { openLocation } from "../src/utils/externalLinks";
const native = vi.hoisted(() => ({
  Platform: { OS: "web" },
  Share: { share: vi.fn() },
  Linking: { openURL: vi.fn() },
}));
const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn() }));
vi.mock("react-native", () => native);
vi.mock("expo-clipboard", () => clipboard);
describe("localização pelo sistema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.Platform.OS = "web";
  });
  it("Web Share recebe endereço/link sem enumerar apps", async () => {
    const share = vi.fn();
    vi.stubGlobal("navigator", { share });
    await openLocation("Rua A", "https://example.test/gps");
    expect(share).toHaveBeenCalledWith({
      title: "Local da celebração",
      text: "Rua A",
      url: "https://example.test/gps",
    });
    expect(native.Linking.openURL).not.toHaveBeenCalled();
  });
  it("Web sem share copia fallback seguro", async () => {
    vi.stubGlobal("navigator", {});
    await expect(
      openLocation("Rua A", "https://example.test/gps"),
    ).resolves.toContain("copiada");
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(
      "Rua A\nhttps://example.test/gps",
    );
  });
  it.each(["android", "ios"])("%s delega ao share nativo", async (os) => {
    native.Platform.OS = os;
    await openLocation("Rua A", "https://example.test/gps");
    expect(native.Share.share).toHaveBeenCalledWith({
      message: "Rua A\nhttps://example.test/gps",
      ...(os === "ios" ? { url: "https://example.test/gps" } : {}),
    });
    expect(native.Linking.openURL).not.toHaveBeenCalled();
  });
  it("destino vazio falha", async () =>
    await expect(openLocation(null, "javascript:alert(1)")).rejects.toThrow());
});
