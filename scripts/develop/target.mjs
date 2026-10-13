export const DEVELOPMENT_REF = 'oxdalpfvahcgzvqyctkq';
export const PRODUCTION_REF = 'nwgyxmwaqckpghznbfzm';
export function assertDevelopmentTarget(ref) {
  if (ref !== DEVELOPMENT_REF || ref === PRODUCTION_REF) throw Error('Target refused: only the authorized DEVELOP project is allowed');
  return DEVELOPMENT_REF;
}
export function developmentApiUrl(ref, suffix = '') {
  assertDevelopmentTarget(ref);
  if (!/^\/(?:config\/auth|api-keys|database\/query|functions|secrets)$/.test(suffix) && suffix !== '') throw Error('Management operation outside DEV allowlist');
  return `https://api.supabase.com/v1/projects/${DEVELOPMENT_REF}${suffix}`;
}
export function developmentFunctionUrl(ref, name) {
  assertDevelopmentTarget(ref);
  if (!['redeem-invitation','dispatch-notifications','send-invitations','sync-sheets'].includes(name)) throw Error('Unknown DEV function');
  return `https://${DEVELOPMENT_REF}.supabase.co/functions/v1/${name}`;
}
