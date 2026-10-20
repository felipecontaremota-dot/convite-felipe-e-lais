# Espaço dos Padrinhos

Promotion is a separate, additive lifecycle in `wedding_party_private.promotions`.
The authenticated RPCs read/check the canonical event and existing family session.
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

## Historical implementation (2026-10-19, superseded below)

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

## Version 2 — coordinated opening and optional treatment (2026-10-20)

The previous extraction selector was unconditional and ran on mount. Its 1,400 ms
launch also preceded the flap's 1,600 ms completion. It is replaced by
`envelopeTimeline.ts`: seal 400 ms → flap 1,100 ms → a painted fully-open frame →
extraction 2,400 ms → white overlay 460 ms. Each step awaits Animation.finished;
a duration + 1,500 ms watchdog is failure recovery only, not normal synchronization.
The letter starts invisible and clipped inside the pocket. Front folds remain above
its layer throughout extraction. There is no camera flight or scaling transition.
The document switches to the article at full white, holds for 120 ms and unveils
for 520 ms (1,100 ms total light transition). Reduced motion skips the opening/flash.
Leaving aborts animations; repeated activation is locked before any await.

The predominantly white physical paper uses a local deterministic grayscale fiber
SVG, subtle edge wear, irregular clipping and an external soft shadow. Text remains
selectable HTML. Dancing Script (local variable 400–700, SIL OFL) replaces Caveat;
title and real bold names use the same family with system cursive fallbacks.
The only narrative edit is “pedido do coração” → “pedido de coração”.

`useLetterReading` derives each paragraph state from its real position, scroll direction
and a reading line at 90% of the viewport, with a 48 px hysteresis band. Above-reading
paragraphs stay shown. Those below fade out on upward scrolling, then reappear on descent.
One RAF batches scroll/observer notifications; a single CSS transition per property
lasts 1,350 ms (previous 850 + 500), with no per-scroll Animation accumulation.
Content defaults to readable, including failed/missing observer, print and reduced motion.

`display_name` is an optional <=100-character text column on the existing private
promotions table. Existing values start NULL with no identity-based backfill.
No person-specific treatment exists in live RPCs or JavaScript. Empty means first
registered name. Names/nicknames with spaces are supported and rendered as React text.
The ADMIN-only `wedding_party_admin_save_details` RPC uses the established event lock,
expected cycle, expected previous message and expected previous nickname; concurrent stale
edits fail atomically. It delegates canonical creation/message validation to the existing
six-argument RPC, preserving that endpoint's compatibility. Editing/clearing does not
reset role, cycle, acceptance, completion or message. Ordinary guests see only their
selected person's treatment through the actor-scoped state RPC. Family declaration
boundaries documented above remain unchanged.

The additive `wedding_party_nicknames` migration replaces the live hardcoded state
function, extends admin reads and adds one checked authenticated SECURITY DEFINER RPC.
Previously applied migrations remain immutable. No real guest is promoted or edited by
this migration. Postflight checks all six RPCs, fixed search_path, owner, private schema,
RLS and role grants. No Edge Function or auth/RSVP change is necessary.

Browser tests capture actual paused native-animation frames at 320, 768 and 1280 px,
including closed, partially/fully open flap, start/partial/complete extraction, white peak,
white paper and scroll in both directions. They check physical geometry, computed opacity,
no pre-click extraction, ordering and repeat activation. Database tests exercise generic
compound treatment, no backfill, literal text, create/edit/clear, stale edits, two devices,
role/event/family isolation and unchanged cycle/timestamps/message/RSVP/credentials.

### Version 2 production postflight

Applied `20261020172200_wedding_party_nicknames.sql` (the filename matches the
production migration runner's recorded version). Read-only postflight passed for
all six authenticated RPCs, owner, fixed search_path, private grants, RLS and
unauthenticated denial. The digest of all preexisting promotion fields is identical
before/after the migration. All existing nicknames are NULL: no guest-specific backfill.
The live state function no longer contains the historical name exception.

The security advisor adds only the expected authenticated SECURITY DEFINER finding
for the new checked ADMIN RPC; all other findings are unchanged. The rationale and
[Supabase advisory reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
are the same as for the existing guarded RPCs; direct private-table access remains denied.

Validation: 340 unit tests, all 235 E2E, isolated full database regression, focused
lifecycle/nickname SQL and real authenticated two-device browser integration passed.
Lint, typecheck, web build/export and native PWA asset/installability validation passed.
[Visual inspection panels at 320, 768 and 1280 px](evidence/wedding-party-v2/README.md)
record the opening, white peak, paper and bidirectional reading. The three frame
checks also passed after refining the partial-flap capture angle. No production
guest was edited for testing. Authenticated inspection of the published custom domain
is limited by the environment proxy's CONNECT rejection, not a demonstrated site error.

### CI validation follow-up

The first Version 2 CI run passed 234 E2E and failed the preexisting dashboard
keyboard drilldown test at the second card. The preceding production commit had
already failed the same test at the other viewport. The test could observe the
synchronous modal focus restoration, focus the next card and then have that focus
stolen by the dashboard's pending requestAnimationFrame restoration. The test now
waits through that rendering boundary before continuing its keyboard assertions;
no dashboard or modal implementation changed and no assertion was removed.
Ten consecutive targeted runs (five each at 320 and 1280 px), lint and typecheck
passed before publishing this test-only follow-up.
