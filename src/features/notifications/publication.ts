export function publicationCaption(value: string) {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (k: string) => p.find((x) => x.type === k)?.value || "";
  return `Noivos, em ${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
}
export function deliveryLabel(status: string) {
  return (
    (
      {
        pending: "Aguardando processamento",
        processing: "Em processamento",
        sent: "Enviada ao provedor",
        failed: "Falha no envio",
        uncertain: "Resultado não confirmado",
        skipped: "Não enviada — consentimento ou disponibilidade",
        cancelled: "Cancelada",
      } as Record<string, string>
    )[status] || "Estado histórico não identificado"
  );
}
