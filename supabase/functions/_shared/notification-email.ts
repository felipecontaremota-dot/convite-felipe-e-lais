const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function notificationEmail(title: string, body: string, base: string) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid public URL');
  const root = url.href.replace(/\/$/, '');
  const home = root + '/inicio', account = root + '/perfil';
  return {
    text: `Felipe & Laís\n${title}\n\n${body}\n\n15 de dezembro de 2026 · 16h\nAcesse o convite: ${home}\nGerencie ou cancele estas comunicações em Minha conta: ${account}`,
    html: `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#F5F9FD;color:#18324F;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:white;border-radius:18px"><h1>Felipe &amp; Laís</h1><p>15 de dezembro de 2026 · 16h</p><h2>${escape(title)}</h2><div style="white-space:pre-wrap;line-height:1.6;overflow-wrap:break-word">${escape(body)}</div><p><a href="${escape(home)}" style="color:#245F95">Abrir nosso convite</a></p><p style="font-size:13px">Você autorizou estas comunicações. <a href="${escape(account)}">Gerenciar ou cancelar recebimento em Minha conta</a>.</p></main></body></html>`
  };
}
