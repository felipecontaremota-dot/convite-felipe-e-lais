// Centralized invitation artwork and HTML; sending and credentials stay in the handler.
const artworkUrl =
  "https://nwgyxmwaqckpghznbfzm.supabase.co/storage/v1/object/public/convites-assets/convite-email_v2.jpeg";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
export function invitationTemplate(
  name: string,
  url: string,
  password: string,
) {
  return {
    title: "Felipe & Laís têm um convite especial para você 💍",
    text: `Felipe & Laís\nOlá, ${name},\nTemos um convite especial para você.\n15 de dezembro de 2026 · 16h\nABRIR NOSSO CONVITE: ${url}\nSenha de acesso: ${password}`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#faf7f0;color:#183f35;font-family:Georgia,serif;">
<tr><td align="center" style="padding:16px 0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:24px 24px 8px;font-size:16px;line-height:24px;">Olá, ${escape(name)},</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Temos um convite especial para você!</td></tr>
<tr><td align="center" style="padding:0;"><a href="${escape(url)}" style="display:block;text-decoration:none;"><img src="${artworkUrl}" alt="Convite de casamento de Felipe &amp; Laís — acesse seu convite pelo link abaixo" width="600" border="0" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
<tr><td style="padding:24px 24px 16px;font-size:16px;line-height:24px;">A sua senha de acesso é: <strong>${escape(password)}</strong></td></tr>
<tr><td style="padding:0 24px 8px;font-size:16px;line-height:24px;">Você também pode acessar o seu convite através desse link:</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;word-break:break-all;"><a href="${escape(url)}" style="color:#183f35;text-decoration:underline;word-break:break-all;">${escape(url)}</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`,
  };
}
