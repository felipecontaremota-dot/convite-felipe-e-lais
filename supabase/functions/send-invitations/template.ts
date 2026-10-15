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
    text: `Olá, ${name}! Tudo bem? 🥰

Temos um convite especial para você!

É isso mesmo! Seu nome está na nossa lista de pessoas especiais e, por isso, temos a alegria e a honra de te convidar para celebrar um dos momentos mais importantes da nossa história: O NOSSO CASAMENTO! 💍❤️

📅 15 de dezembro de 2026
⏰ Às 16h (horário de Goiás)
📍 Villarejo — Aparecida de Goiânia/GO

Preparamos para você um convite exclusivo, 100% digital, interativo e que até vira um aplicativo no seu celular! 📲

E o melhor: ele foi preparado com muito carinho, pensando em cada detalhe para tornar essa experiência ainda mais especial!

🔐 COMO ACESSAR SEU CONVITE?

Basta clicar na imagem acima e digitar sua senha individual: 🔑 ${password}

Ou então, no seu link exclusivo: ${url} e digitar sua senha individual: 🔑 ${password}

Ou acessar o nosso site https://www.felipeelais2026.com.br e digitar seu NOME COMPLETO e sua senha individual: 🔑 ${password}

✨ Lá dentro, você vai encontrar todas as informações sobre o casamento, localização, confirmação de presença e algumas surpresinhas que preparamos!

💙 Ahhh, um pedido importante: não esqueça de confirmar sua presença pelo próprio convite, combinado? É por lá que vamos organizar nossa lista e liberar seu QR Code de acesso ao evento!

Estamos contando os dias para celebrar esse momento e esperamos, de coração, poder dividir essa alegria com você! 🥹🥂

Com muito carinho,
Felipe & Laís 💙💍`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#faf7f0;color:#183f35;font-family:Georgia,serif;">
<tr><td align="center" style="padding:16px 0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:24px 24px 16px;font-size:16px;line-height:24px;">Olá, <strong>${escape(name)}</strong>! Tudo bem? 🥰</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Temos um convite especial para você!</td></tr>
<tr><td align="center" style="padding:0;"><a href="${escape(url)}" style="display:block;text-decoration:none;"><img src="${artworkUrl}" alt="Convite de casamento de Felipe &amp; Laís — acesse seu convite pelo link abaixo" width="600" border="0" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
<tr><td style="padding:24px 24px 16px;font-size:16px;line-height:24px;">É isso mesmo! Seu nome está na nossa lista de pessoas especiais e, por isso, temos a alegria e a honra de te convidar para celebrar um dos momentos mais importantes da nossa história: <strong>O NOSSO CASAMENTO!</strong> 💍❤️</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">📅 <strong>15 de dezembro de 2026</strong><br>⏰ <strong>Às 16h (horário de Goiás)</strong><br>📍 <strong>Villarejo — Aparecida de Goiânia/GO</strong></td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Preparamos para você um convite exclusivo, <strong>100% digital, interativo e que até vira um aplicativo no seu celular!</strong> 📲</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">E o melhor: ele foi preparado com muito carinho, pensando em cada detalhe para tornar essa experiência ainda mais especial!</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">🔐 <strong>COMO ACESSAR SEU CONVITE?</strong></td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Basta clicar na imagem acima e digitar sua senha individual: 🔑 <strong>${escape(password)}</strong></td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Ou então, no seu link exclusivo: <a href="${escape(url)}" style="color:#183f35;text-decoration:underline;word-break:break-all;">${escape(url)}</a> e digitar sua senha individual: 🔑 <strong>${escape(password)}</strong></td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Ou acessar o <strong>nosso site</strong> <a href="https://www.felipeelais2026.com.br" style="color:#183f35;text-decoration:underline;">https://www.felipeelais2026.com.br</a> e digitar seu NOME COMPLETO e sua senha individual: 🔑 <strong>${escape(password)}</strong></td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">✨ Lá dentro, você vai encontrar todas as informações sobre o casamento, localização, confirmação de presença e algumas surpresinhas que preparamos!</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">💙 <strong>Ahhh, um pedido importante:</strong> não esqueça de confirmar sua presença pelo próprio convite, combinado? É por lá que vamos organizar nossa lista e liberar seu QR Code de acesso ao evento!</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;">Estamos contando os dias para celebrar esse momento e esperamos, de coração, poder dividir essa alegria com você! 🥹🥂</td></tr>
<tr><td style="padding:0 24px 24px;font-size:16px;line-height:24px;"><strong>Com muito carinho,</strong><br><strong>Felipe &amp; Laís</strong> 💙💍</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`,
  };
}
