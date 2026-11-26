// Pure, shared by the ADMIN preview and the delivery worker. No credentials persist here.
export const reminderSubject =
  "FALTAM APENAS 10 DIAS PARA O NOSSO CASAMENTO 💙💍";
export const reminderBody = `Olá, **{{nome}}!** Tudo bem? 🥰

**FALTAM APENAS 10 DIAS!**

A contagem regressiva está chegando ao fim e, em breve, estaremos juntos para celebrar um dos momentos mais especiais das nossas vidas: **O NOSSO CASAMENTO!** 💍

Estamos muito felizes por saber que você estará conosco nesse dia tão importante!

Relembrando os detalhes:

📅 **15 de dezembro de 2026**

⏰ **Às 16h**

📍 **Villarejo — Aparecida de Goiânia/GO**

Não se esqueça de acessar a tela **INFORMAÇÕES** no seu convite digital para conferir todas as informações sobre o casamento, a localização e o seu QR Code de acesso ao evento.

**Acesse seu convite exclusivo:**

{{link}}

🔑 **Sua senha:** {{senha}}

Estamos preparando cada detalhe com muito carinho e contando os dias para compartilhar essa alegria com você!

Nos vemos em breve! 🥂

**Com muito carinho,**

**Felipe & Laís** 💙💍`;
export const reminderFilename = "Template-Faltam 10 dias-horizontal.png";
export function reminderImage(base: string) {
  return new URL(
    `/storage/v1/object/public/convites-assets/${encodeURIComponent(reminderFilename)}`,
    base,
  ).href;
}
export function reminderContentError(subject: string, body: string) {
  if (!subject.trim() || subject.length > 200 || /[\r\n{}]/.test(subject))
    return "Informe um assunto válido, sem placeholders.";
  if (!body.trim() || body.length > 8000)
    return "Informe uma mensagem de até 8.000 caracteres.";
  const tokens: string[] = body.match(/{{[^{}]*}}/g) || [];
  if (
    ["{{nome}}", "{{link}}", "{{senha}}"].some((t) => !tokens.includes(t)) ||
    tokens.some((t) => !["{{nome}}", "{{link}}", "{{senha}}"].includes(t)) ||
    /[{}]/.test(body.replace(/{{(?:nome|link|senha)}}/g, ""))
  )
    return "Preserve os placeholders {{nome}}, {{link}} e {{senha}}; outros não são permitidos.";
  return "";
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reminderTemplate(
  subject: string,
  body: string,
  data: { name: string; url: string; pin: string; image: string },
) {
  if (reminderContentError(subject, body))
    throw Error("invalid reminder content");
  const target = new URL(data.url),
    image = new URL(data.image);
  if (
    [target, image].some(
      (u) => u.protocol !== "https:" || !!u.username || !!u.password,
    )
  )
    throw Error("invalid reminder URL");
  // Escape each source segment BEFORE interpolation, so names cannot introduce markup/placeholders.
  const values: Record<string, string> = {
    nome: data.name,
    link: data.url,
    senha: data.pin,
  };
  const text = body
    .replace(/\*\*/g, "")
    .replace(/{{(nome|link|senha)}}/g, (_, k) => values[k]!);
  const inline = (s: string) =>
    s
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part) => {
        const strong = part.startsWith("**") && part.endsWith("**");
        const source = strong ? part.slice(2, -2) : part;
        const rendered = source
          .split(/({{(?:nome|link|senha)}})/g)
          .map((segment) => {
            if (segment === "{{link}}")
              return `<a href="${escape(data.url)}" style="color:#245F95;word-break:break-all;">${escape(data.url)}</a>`;
            return escape(
              /^{{/.test(segment)
                ? values[segment.slice(2, -2)]!
                : segment,
            ).replace(/\n/g, "<br>");
          })
          .join("");
        return strong ? `<strong>${rendered}</strong>` : rendered;
      })
      .join("");
  const paragraphs = body
    .split(/\n\n/)
    .map((p) =>
      p.trim() === "{{link}}"
        ? `<tr><td align="center" style="padding:0 24px 20px;"><a href="${escape(data.url)}" style="display:inline-block;padding:16px 24px;background:#245F95;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold;">Acessar meu convite</a><p style="font-size:13px;word-break:break-all;">${inline(p)}</p></td></tr>`
        : `<tr><td style="padding:0 24px 18px;font-size:16px;line-height:26px;overflow-wrap:break-word;">${inline(p)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F5F9FD;color:#18324F;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 0;"><!--[if mso]><table width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-top:3px solid #B59654;"><tr><td style="padding:0 0 24px;"><img src="${escape(data.image)}" alt="Felipe &amp; Laís — Faltam apenas 10 dias para o nosso sim!" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>${paragraphs}</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  return { title: subject, text, html };
}
export function reminderDue(startsAt: string) {
  return new Date(new Date(startsAt).getTime() - 10 * 86400000).toISOString();
}
