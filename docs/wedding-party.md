# Espaço dos Padrinhos

Promotion is a separate, additive lifecycle in `wedding_party_private.promotions`.
The four authenticated RPCs read/check the canonical event and existing family session.
No authentication, mutation/snapshot delegation, invitation or RSVP implementation is replaced.

## Identity and access boundary

`invitation_sessions.profile_guest_id` identifies the person explicitly declared in Perfil.
A family login authorizes its members to make this declaration; it is **not individual
identity verification**. Selecting the promoted person within an authorized family can
therefore expose that person's experience to that family session. No other family member
is automatically promoted. Stronger isolation between people sharing credentials would
require a separate personal authentication factor, outside this feature's scope.

The server derives the selected person (singleton fallback only), checks active/unarchived
invitation, confirmed profile, event scope and active promotion. Guest RPCs never accept a
client-selected guest ID. Admin mutations require ADMIN, event/guest locks and the expected
active cycle. Demotion serializes against guest acceptance/completion and never deletes
RSVP, credentials or old cycles. A new promotion creates a new UUID cycle.

## Persistence and replay

`accepted_at` is independent of RSVP. `completed_at` is written only by the final UI action
after acceptance. Both timestamps use coalesce under the event lock and are idempotent.
Reload/interruption before completion leaves automatic presentation eligible on next entry.
Manual space access opens the menu. Replay is local presentation and reuses the same cycle.
No guest is promoted by the migration; existing data is unchanged.

The single query provider polls every 15 seconds and rechecks on browser focus. Backend
revocation is immediate; existing UI can take up to the next refresh to disappear. Offline
or failed checks deny exclusive UI. Each direct page access performs a fresh check.

Admin promotion is available after the guest has been saved, through the existing edit form.
This preserves canonical access-unit creation and avoids partially creating a guest and promotion.
Gender comes from explicit greeting_form; missing gender requires explicit selection.

The visual implementation follows the supplied written reference (no separate simulation
artifact was attached). Two gold accents are scoped to this feature; global blue tokens are unchanged.
Traje and ceremony pages intentionally contain informative empty states, without invented rules.

## Deployment

1. Run unit/E2E, lint/typecheck, build and `npm run test:db` (isolated PostgreSQL only).
2. Apply the generated additive migration before publishing the frontend.
3. Run `scripts/wedding-party-postflight.sql`, inspect role grants/RLS, and deploy main via Pages.
4. No Edge Function deployment or changes to secrets/production invitation data are required.

## Production verification (2026-10-16)

Applied `20261016212418_wedding_party_experience.sql`; the filename matches the
version recorded by the production migration runner. Catalog postflight passed,
unauthenticated access was denied, and the new promotions table contained zero rows.
No existing guests were modified or promoted.

The security advisor reports the intentional [deny-all private table without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and the four [authenticated SECURITY DEFINER RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
These RPCs are intentionally callable: each checks event, actor and ownership/ADMIN,
uses a fixed pg_catalog search_path, and never grants direct private-table access.
Tests exercise unauthorized, other-event, revoked and inactive-session denial.

## Personalized paper letter (2026-10-19)

The opening is a layered HTML/CSS envelope with paper grain, independent folds,
a hinged 3D flap, seal release and a clipped letter that emerges behind the front folds.
A viewport-sized portal continues the same sheet toward the reader. The 5,200 ms
sequence uses transform/opacity; a 5,450 ms independent timeout prevents a failed
animation from stranding navigation. Repeated activation is locked synchronously. A 420 ms paper crossfade settles the
full-frame sheet into the reading article (about 5.6 seconds including handoff).
Reduced motion opens the readable letter immediately; leaving the route cancels timers.
The native fallback remains a static, accessible envelope and readable text.

Caveat (variable weights 400–700), bundled locally with its SIL OFL license in
`public/fonts`, supplies the web letter's handwriting without third-party font requests.
The article uses natural scrolling and selects text normally. IntersectionObserver
triggers a one-time Web Animation per paragraph. Text is visible by default, so a
missing observer/animation API cannot hide the narrative or final actions.

The complete requested narrative is in `letterContent.ts`. Personal paragraphs retain blank
lines and single line breaks and are rendered as React text, never HTML. Two name
occurrences are bold. An explicit server-side full-name treatment rule resolves only Amanda
Curcio Cariolano Romão Medina (NFC, case/spacing normalized) to Medina within the
selected guest's authorized state. Other Amandas retain their first name. The full-name
exception is not embedded in the public JavaScript, and registered names are unchanged.

`personal_message` extends the existing private promotions table. Null is retained
for existing cycles until the noivos write their messages; no content is fabricated.
The authenticated ADMIN-only `wedding_party_admin_save` RPC atomically promotes and
saves, or updates the message in place, without resetting acceptance/completion.
It reuses existing locks/creation, checks the expected cycle and previous message,
limits text to 12,000 characters, and never logs message contents. The existing
actor-scoped state RPC returns only the selected person's message. Same-family
identity declaration boundaries documented above continue to apply.

The admin modal supports cancel-before-promotion and later editing. Gender comes
from the recorded promotion during editing. Re-promotion creates a new cycle and
requires a new message. Last-screen cards, RSVP, authentication and Home are unchanged.

Migration `20261019232846_wedding_party_letters.sql` was applied to production;
its filename matches the version recorded by the migration runner. RLS, private-schema
and table grants, all five authenticated RPCs' fixed search_path/owner, and unauthenticated
denial passed the read-only postflight. No existing guest names, classification,
acceptance, completion or RSVP data were changed by the migration. The new message
field remains null until an administrator writes it. The additional authenticated
SECURITY DEFINER advisory is intentional for the checked ADMIN-only save RPC;
the rationale and Supabase remediation reference are documented above.
