# Permanent development workflow

Production is `main`, Supabase `nwgyxmwaqckpghznbfzm`, https://felipeelais2026.com.br.
Development is `develop`, Supabase `oxdalpfvahcgzvqyctkq`, proposed https://develop.felipeelais2026.com.br.
This change prepares artifacts only. Neither hosted Supabase project is initialized, linked or deployed by these scripts/workflows.

Feature branches target develop. Human-reviewed develop -> main promotion is separate from a controlled production database/Function release. Never force-push. GitHub branch protections should be configured manually to require CI/review; no protection settings are changed here.

## Environment boundaries

Copy the appropriate example into an ignored local `.env` and enter only that project's PUBLIC publishable/anon key. Remote URLs require explicit EXPO_PUBLIC_APP_ENV. The Expo config validates exact project host and legacy JWT role/ref, refuses privileged keys/public-secret variables, and refuses a production build from develop. Native DEV identifiers and deep-link scheme are separate (`felipeelaisdev`). Local tests use localhost and synthetic keys.

APP_ENV=development is the server runtime setting for DEV. Shared HTTP validates its Supabase project; even if production provider credentials were accidentally entered, DEV disables external provider calls. It also blocks raw shared HTTP provider requests (including Sheets). No secrets are copied. Preserve production legacy key names; key migration is out of scope. Never set EXPO_PUBLIC_SERVICE_ROLE_KEY.

## Independent DEV site

A single GitHub Pages site in this repository cannot safely publish two independent applications. `develop-build.yml` uploads a regular GitHub artifact only, with no pages permission and no deploy action. Its Supabase URL is fixed to DEV; the separate Repository Variable is DEV_EXPO_PUBLIC_SUPABASE_ANON_KEY. If missing, the artifact retains the existing unavailable-backend fallback; it is not a ready connected site.

Use a separate static hosting project (for example manual Cloudflare Pages artifact upload), or a separate DEV-only Pages repository, after authorization. Do not attach develop to the production Pages environment. Configure SPA fallback to index.html, root base, HTTPS and the proposed DEV domain. DEV CNAME is generated into the artifact; production CNAME/source is preserved. DNS and hosting are not modified now. Do not upload the develop artifact over the production site.

## Canonical migrations

001–007 filenames now match production's historical versions exactly. SQL contents are unchanged. 008 and 009 are `20261013125226_profile_consent.sql` and `20261013125227_password_entry.sql`: UTC preparation time 2026-10-13 12:52:26 and the following second, in a single reserved ordered release. These are real preparation timestamps, not fictitious mappings to other local filenames. `config/migrations.json` pins all nine checksums. Never leave executable duplicate versions.

All SQL consumers use canonical paths. A normal CLI-applied DEV migration records that exact filename version. For controlled PROD envelopes, registration occurs atomically before COMMIT with the same version. No repair is required for these filename identities; existing production records are untouched. Validate material equivalence/CLI migration list before future production use; filenames alone don't prove schema equality.

## Future empty DEV initialization — NOT executed

1. Obtain explicit authorization CONFIGURAR E IMPLANTAR NO SUPABASE DEVELOP.
2. Verify the target ref and empty history manually. Prepare staging OFFLINE:
   `node scripts/operations/prepare-dev-baseline.mjs /tmp/wedding-dev-baseline`
3. Only after authorization, link the staging directory to DEV, never the checkout or PROD:
   `supabase --workdir /tmp/wedding-dev-baseline link --project-ref oxdalpfvahcgzvqyctkq`
4. Review `supabase --workdir /tmp/wedding-dev-baseline db push --dry-run`; apply only the seven staged canonical files after approval. No seed is automatically run.
5. Inspect roles/ACL/RLS and RPC contracts; run approved read-only baseline gates. Never apply tests/db-bootstrap.sql to hosted Supabase (it is an isolated Auth stub).
6. Auth Dashboard: Allow new users to sign up ON; Allow anonymous sign-ins ON; Allow manual linking OFF. Configure Site URL/redirects to DEV and felipeelaisdev only. No production Auth changes.
7. Create synthetic staff Auth and anonymous test identities through authorized DEV Auth workflows (staff creation with explicit auto-confirm, never inviteUserByEmail or an email invitation), not copied production UUIDs or dumps. Pass their UUIDs to the reviewed dev-fixtures.sql, only after verifying the DEV connection. All fixture contacts use example.test; sample telephone-shaped values are synthetic and never delivered to.
8. The richer family/message/QR/consent fixtures under tests/ are for disposable local PostgreSQL; they must not be blindly applied remotely. Build corresponding DEV fixtures using real Auth identities and approved application RPCs. Validate link/PIN and snapshots before 008.
9. Apply 008, checkpoint, then 009 and checkpoint with the approved mechanism. No production credentials or data.
10. Deploy DEV Functions only after authorization. Set APP_ENV=development and an independent WORKER_SECRET if workers are exercised. PUBLIC_WEB_BASE_URL points to DEV. EMAIL_PROVIDER=disabled; no EMAIL_API_KEY, WhatsApp, Expo or Google service credentials are needed for mocked DEV tests. Runtime default SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY must belong to DEV. verify_jwt=false remains required, with handler Auth still enforced.
11. Execute DEV smoke/regression with synthetic users; actual external communications remain disabled. Publish the DEV site only with separate authorization.

## Local validation

`npm ci`, lint, typecheck, unit tests, check:functions, test:functions, test:db, build:web, test:export, test:e2e and Android/iOS exports. Database tests use disposable containers locally or exclusive temporary databases in Actions; no linked Supabase access. Providers in Function tests are mocked. `test:maintenance` rehearses atomic migration history and the operational barrier. Existing suites retain consent, collision, exhaustion, rate-limit and concurrent-transaction assertions.
