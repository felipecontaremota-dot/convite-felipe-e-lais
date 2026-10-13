export const refs: Readonly<{ development: string; production: string }>;
export function validateEnvironment(env: Record<string, string | undefined>, branch?: string): 'local' | 'development' | 'production';

export function currentBranch(): string | undefined;
