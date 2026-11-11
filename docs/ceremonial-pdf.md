# Ceremonial guest PDF

## Implementation

`guestPdfData.ts` creates the six-column projection from the existing event
snapshot/export data. It uses the canonical `adminRsvpStatus` (`CONFIRMED` only),
`party_role`, invitation family name and `admin_notes`. It reuses existing export
filter semantics without modifying the Excel writer, rows, filters or permissions.
Sorting in pt-BR precedes numbering. The three summary counts use only the final
PDF projection. ADMIN and CEREMONIALIST get the same safe PDF fields; neither PDF
contains contacts, links, PINs or QR data.

The restricted RPC deliberately omits notes. `GuestExportButton` uses notes already
authorized in the operational snapshot, matching guest ID and event, without a
new RPC, table, policy, cache or broader privilege. Excel keeps its original source
and ten columns, including ADMIN-only data according to existing authorization.

`guestPdf.ts` renders A4 portrait with jsPDF. P052 Roman/Bold is the embedded serif
fallback because Palatino Linotype is not available with redistribution rights.
See `assets/pdf/fonts/README.md` and its upstream license. No font or template is
fetched at runtime. PDF.js is a **development-only** parser for tests of the real
PDF output; it is not included in the application's PDF generation path.

A millimetre-based layout wraps names/families and groups guest+note when they fit
on a new page. Exceptionally long notes continue over subsequent pages. Every
page repeats the table header; subsequent pages use a compact heading. A final
pass writes the total page count and the actual generation timestamp formatted
with `America/Sao_Paulo`. Manual check-in squares are always empty vector boxes,
independent of digital check-in. Zero confirmed guests generates an explicit
empty document; Excel's empty-result behavior is unchanged.

## Official monogram

The original `assets/branding/Monograma Dourado F & L.png` is resolved directly by
Expo Asset/Metro in `guestPdfMonogram.ts`, loaded from the application's own origin
and passed as the original PNG bytes to jsPDF. No source image copy, transform,
canvas conversion, external URL or Storage service is used. The original asset
remains unchanged, with SHA-256
`4de9ceeafc38cb89e1ac5a87c21ac0f967eac0f863b9582180cb69fed67d16fc`.

jsPDF reads the true image dimensions (1695 × 928), preserves PNG transparency
with a soft mask, and paints it once on page one at 26 × 14.234808 mm, centered
at x=105 mm and y=12 mm. The PNG remains sharp at this print size (about 1656 dpi).
Subsequent pages have only the compact text heading. The asset's path is resolved
by the bundler, including spaces, the ampersand and deployment base paths.

Tests parse real PDFs with PDF.js, including accents/Unicode, bounds, headings,
footers, page totals, notes and absence of administrative fields. Export E2E
covers ADMIN and CEREMONIALIST plus existing Excel behavior at mobile and desktop
widths. The monogram tests also verify original pixels/alpha after PDF embedding.
