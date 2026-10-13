import { assertDevelopmentTarget, developmentApiUrl, DEVELOPMENT_REF } from './target.mjs';
export class DevelopManagement {
  constructor({ ref, token, fetchImpl = fetch }) {
    this.ref = assertDevelopmentTarget(ref);
    if (!token) throw Error('SUPABASE_ACCESS_TOKEN missing: configure it securely in environment settings, never in chat');
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.verified = false;
  }
  async request(suffix, { method = 'GET', body } = {}) {
    assertDevelopmentTarget(this.ref);
    if (!this.verified && (suffix || method !== 'GET')) throw Error('DEV identity must be verified before configuration, SQL, keys or functions');
    const response = await this.fetchImpl(developmentApiUrl(this.ref, suffix), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw Error(`DEV Management API failed (HTTP ${response.status}); response body withheld`);
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw Error('Invalid DEV API response; body withheld'); }
  }
  async verify() {
    this.verified = false;
    const project = await this.request('');
    if (project.id !== DEVELOPMENT_REF) throw Error('Remote project identity mismatch; no mutation allowed');
    if (project.region !== 'sa-east-1') throw Error('Unexpected DEV region; inspect before continuing');
    this.verified = true;
    return { id: project.id, region: project.region, status: project.status };
  }
  async sql(query) {
    if (typeof query !== 'string' || !query.trim()) throw Error('Empty SQL refused');
    return await this.request('/database/query', { method: 'POST', body: { query } });
  }
}
