export function pushSupport(env: {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: string;
}) {
  if (env.ios && !env.standalone)
    return "No iPhone ou iPad, adicione o convite à Tela de Início e abra o app para ativar notificações.";
  if (!env.supported) return "Este navegador não oferece Web Push.";
  if (env.permission === "denied")
    return "Notificações bloqueadas. Revise a permissão nas configurações do navegador.";
  return env.permission === "granted"
    ? "Permissão concedida. Ative neste aparelho para concluir o registro."
    : "Você pode autorizar notificações neste aparelho.";
}
export function vapidBytes(key: string) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function pushWorkerReady(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 1500);
    channel.port1.onmessage = (e) => finish(e.data?.webPush === true);
    try {
      worker.postMessage({ type: "NOTIFICATION_CAPABILITIES" }, [
        channel.port2,
      ]);
    } catch {
      finish(false);
    }
  });
}
export async function activateWebPush(
  key: string,
  register: (subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }) => Promise<unknown>,
) {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    throw Error("Web Push indisponível.");
  if (Notification.permission === "denied")
    throw Error("Permissão bloqueada nas configurações do navegador.");
  if ((await Notification.requestPermission()) !== "granted")
    throw Error("Permissão de notificações não concedida.");
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active)
    throw Error(
      "Reabra o convite publicado para concluir a instalação do recurso.",
    );
  if (!(await pushWorkerReady(registration.active)))
    throw Error(
      "Feche as abas e o app do convite e abra novamente para concluir a atualização das notificações.",
    );
  let subscription = await registration.pushManager.getSubscription();
  let created = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidBytes(key),
    });
    created = true;
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    throw Error("Subscription inválida.");
  try {
    await register({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
  } catch (e) {
    if (created) await subscription.unsubscribe();
    throw e;
  }
}
export async function unsubscribeWebPush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
}
