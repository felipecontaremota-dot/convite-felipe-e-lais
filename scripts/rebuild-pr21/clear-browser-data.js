/* Paste in DevTools ONLY during the controlled cut, with this app stopped.
   This is an operational tool; it is never bundled or auto-executed. */
(async () => {
  const base = "/convite-felipe-e-lais";
  const event = "00000000-0000-4000-8000-000000000001";
  if (
    !window.location.pathname.startsWith(`${base}/`) &&
    window.location.pathname !== base
  )
    throw new Error("Abra a origem e o caminho corretos do convite.");
  if (
    window.prompt(
      "Para apagar dados locais deste app, digite LIMPAR TESTES",
    ) !== "LIMPAR TESTES"
  )
    return;
  const project = window.prompt(
    "Informe somente o project ref do Supabase (não URL, chave ou senha):",
  );
  if (!project || !/^[a-z0-9-]+$/.test(project))
    throw new Error("Project ref inválido.");
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(store)) {
      if (
        ["queue:", "cache:", "tickets:"].some((prefix) =>
          key.startsWith(`${prefix}${event}:`),
        ) ||
        key === "demo-session" ||
        key.startsWith(`sb-${project}-auth-token`)
      )
        store.removeItem(key);
    }
  }
  for (const registration of await window.navigator.serviceWorker.getRegistrations()) {
    const scope = new URL(registration.scope);
    if (
      scope.origin === window.location.origin &&
      scope.pathname === `${base}/`
    )
      await registration.unregister();
  }
  for (const key of await window.caches.keys()) {
    if (key.startsWith(`felipe-lais:${base}/`)) await window.caches.delete(key);
  }
  // Baseline AsyncStorage Web uses localStorage, not IndexedDB.
  // Any additional IndexedDB database must be identified manually before deleting it.
  window.alert(
    "Dados locais do convite removidos. Feche esta aba; reabra somente após liberação do corte.",
  );
})();
