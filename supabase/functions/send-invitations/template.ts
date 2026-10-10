// Provisional, centralized template; replace this module when final artwork is approved.
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
export function invitationTemplate(
  name: string,
  url: string,
  password: string,
) {
  return {
    title: "Felipe & Laís têm um convite especial para você 💍",
    text:
      `Felipe & Laís\nOlá, ${name},\nTemos um convite especial para você.\n15 de dezembro de 2026 · 16h\nABRIR NOSSO CONVITE: ${url}\nSenha de acesso: ${password}`,
    html:
      `<div style="max-width:580px;margin:auto;padding:36px;background:#faf7f0;color:#183f35;font-family:Georgia,serif"><h1>Felipe &amp; Laís</h1><p>Olá, ${
        escape(name)
      },</p><p>Temos um convite especial para você.</p><p>15 de dezembro de 2026 · 16h</p><p><a href="${
        escape(url)
      }" style="display:inline-block;padding:16px;background:#183f35;color:white;text-decoration:none">ABRIR NOSSO CONVITE</a></p><p>Senha de acesso: <strong>${
        escape(password)
      }</strong></p><p><a href="${escape(url)}">${escape(url)}</a></p></div>`,
  };
}
