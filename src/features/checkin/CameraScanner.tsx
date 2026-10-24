import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { Button, styles } from "../../components/ui";
export function CameraScanner({
  onScan,
  onClose,
  paused = false,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
  paused?: boolean;
}) {
  const [permission, request] = useCameraPermissions();
  const [granted, setGranted] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true),
    starting = useRef(false);
  const startRef = useRef<() => Promise<void>>(async () => undefined);
  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    setError("");
    try {
      const response = permission?.granted ? permission : await request();
      if (!mounted.current) return;
      if (!response.granted)
        setError(
          "Câmera não autorizada ou indisponível. Libere o acesso nas configurações do navegador ou use a busca manual.",
        );
      else setGranted(true);
    } catch {
      if (mounted.current)
        setError(
          "Câmera indisponível. Verifique a permissão e o dispositivo, ou use a busca manual.",
        );
    } finally {
      starting.current = false;
    }
  }, [permission, request]);
  useEffect(() => {
    startRef.current = start;
  }, [start]);
  useEffect(() => {
    mounted.current = true;
    void startRef.current();
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <AdminModal title="Ler QR Code" onClose={onClose} captureKeyboard>
      {!ready && !error ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          Preparando câmera. Autorize o acesso quando solicitado.
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {granted && !error ? (
        <View
          style={{
            height: 280,
            minHeight: 280,
            flexShrink: 0,
            overflow: "hidden",
          }}
          testID="camera-preview"
        >
          <CameraView
            facing="back"
            style={{
              width: "100%",
              height: 280,
              minHeight: 280,
              flex: 0,
              flexBasis: "auto",
              flexShrink: 0,
            }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onCameraReady={() => setReady(true)}
            onBarcodeScanned={
              paused ? undefined : (event) => onScan(event.data)
            }
            onMountError={() => {
              setGranted(false);
              setReady(false);
              setError(
                "Não foi possível iniciar a câmera ou o leitor. Verifique a permissão e tente novamente, ou use a busca manual.",
              );
            }}
          />
        </View>
      ) : null}
      {ready && !error ? (
        <Text style={styles.text}>
          Aponte a câmera para o QR Code individual.
        </Text>
      ) : null}
      {error ? (
        <Button
          title="Tentar abrir câmera novamente"
          onPress={() => void start()}
        />
      ) : null}
      <Button
        secondary
        title="Fechar câmera e usar busca manual"
        onPress={onClose}
      />
    </AdminModal>
  );
}
