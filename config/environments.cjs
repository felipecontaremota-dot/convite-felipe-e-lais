const { Buffer } = require('node:buffer');
const refs = Object.freeze({ development: 'oxdalpfvahcgzvqyctkq', production: 'nwgyxmwaqckpghznbfzm' });
function validateEnvironment(env, branch) {
  const mode = env.EXPO_PUBLIC_APP_ENV || 'local';
  if (!['local', 'development', 'production'].includes(mode)) throw Error('Ambiente inválido');
  if (branch === 'develop' && mode === 'production') throw Error('develop não pode gerar build PROD');
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const domain = env.EXPO_PUBLIC_WEB_BASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (mode === 'local') {
      if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) throw Error('Supabase remoto exige ambiente explícito');
    } else if (parsed.protocol !== 'https:' || parsed.hostname !== `${refs[mode]}.supabase.co` || parsed.pathname !== '/' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error('Projeto Supabase incompatível com ambiente');
  }
  if (mode === 'development' && domain && new URL(domain).hostname === 'felipeelais2026.com.br') throw Error('DEV não pode publicar no domínio PROD');
  if (mode === 'production' && domain && new URL(domain).hostname === 'develop.felipeelais2026.com.br') throw Error('PROD não pode usar domínio DEV');
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (key) {
    if (key.startsWith('sb_secret_')) throw Error('Chave privilegiada proibida no frontend');
    if (key.split('.').length === 3) {
      let payload;
      try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { throw Error('Chave pública inválida'); }
      if (payload.role !== 'anon' || (refs[mode] && payload.ref !== refs[mode])) throw Error('Chave frontend incompatível');
    } else if (mode !== 'local' && !key.startsWith('sb_publishable_')) throw Error('Chave pública inválida');
  }
  for (const name of Object.keys(env)) if (name.startsWith('EXPO_PUBLIC_') && /SERVICE_ROLE|SECRET|PRIVATE_KEY|WORKER_SECRET|EMAIL_API_KEY|WHATSAPP_ACCESS_TOKEN/.test(name)) throw Error('Secret em variável pública proibido');
  return mode;
}
function currentBranch() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try { return require('node:child_process').execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(); } catch { return undefined; }
}
module.exports = { refs, validateEnvironment, currentBranch };
