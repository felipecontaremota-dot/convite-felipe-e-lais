export function scheduledInstant(date: string, time: string, now = Date.now()) {
  const normalized = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
    ? date.split("/").reverse().join("-")
    : date;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw Error("Informe data e horário válidos.");
  const instant = new Date(`${normalized}T${time}:00-03:00`);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  if (!Number.isFinite(instant.getTime()) || parts !== `${normalized} ${time}`)
    throw Error("Informe data e horário válidos.");
  if (instant.getTime() <= now) throw Error("Escolha uma data futura.");
  return instant.toISOString();
}
export function scheduleFields(instant?: string) {
  if (!instant) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
  const [date, time] = parts.split(" ");
  return { date: date || "", time: time || "" };
}

export function scheduledContentError(
  title: string,
  body: string,
  channels: string[],
) {
  const content = title.trim() + "\n" + body.trim();
  const bytes = (text: string) =>
    Array.from(text).reduce((sum, char) => {
      const code = char.codePointAt(0)!;
      return sum + (code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4);
    }, 0);
  if (channels.includes("PUSH") && bytes(JSON.stringify(content)) > 3000)
    return "Reduza a mensagem para o limite seguro de PUSH.";
  if (channels.includes("WHATSAPP") && bytes(content) > 1000)
    return "Reduza a mensagem para o limite seguro do template WHATSAPP.";
  return null;
}
