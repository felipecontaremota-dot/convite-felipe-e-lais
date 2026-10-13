import { describe, it, expect } from 'vitest';
import { validateEnvironment, refs } from '../config/environments.cjs';
describe('environment isolation', () => {
  it.each(['development','production'] as const)('accepts correct %s project', mode => {
    expect(validateEnvironment({EXPO_PUBLIC_APP_ENV:mode, EXPO_PUBLIC_SUPABASE_URL:`https://${refs[mode]}.supabase.co`})).toBe(mode);
  });
  it.each(['development','production'] as const)('rejects opposite project in %s', mode => {
    const other=mode==='development'?'production':'development';
    expect(()=>validateEnvironment({EXPO_PUBLIC_APP_ENV:mode,EXPO_PUBLIC_SUPABASE_URL:`https://${refs[other]}.supabase.co`})).toThrow();
  });
  it('rejects privileged/public secrets and production from develop', () => {
    expect(()=>validateEnvironment({EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY:'not-a-secret'})).toThrow();
    expect(()=>validateEnvironment({EXPO_PUBLIC_APP_ENV:'production'},'develop')).toThrow();
    expect(()=>validateEnvironment({EXPO_PUBLIC_APP_ENV:'development',EXPO_PUBLIC_SUPABASE_ANON_KEY:'sb_secret_test'})).toThrow();
  });
  it('rejects implicit remote environment and production domain for DEV',()=>{
    expect(()=>validateEnvironment({EXPO_PUBLIC_SUPABASE_URL:`https://${refs.production}.supabase.co`})).toThrow();
    expect(()=>validateEnvironment({EXPO_PUBLIC_APP_ENV:'development',EXPO_PUBLIC_WEB_BASE_URL:'https://felipeelais2026.com.br'})).toThrow();
  });
});
