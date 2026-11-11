# PDF serif fonts

Unmodified P052 Roman/Bold TrueType fonts from the official URW Base 35 project:
https://github.com/ArtifexSoftware/urw-base35-fonts/tree/master/fonts

Retrieved 2026-11-10. P052 is the locally embedded, Palatino-like serif fallback;
these are **not** proprietary Palatino Linotype font files. They do not depend
on installed fonts or a runtime web service. Only the PDF lazy module uses them.

The upstream LICENSE (AGPL-3 with the PDF/PostScript font exception) and COPYING
are included alongside the original, unmodified fonts. The exception expressly
permits embedding the fonts in PDF documents regardless of the document license.

SHA-256:

- P052-Roman.ttf: `5ebaf9c427fb6afd48f7173d6b43c89ba849d4214796d15ed5315a65afc64f77`
- P052-Bold.ttf: `1b932fe1167659bdec980d58bba90b2be06e94748caac225ba2f675e40d32d24`

Regenerate the locally bundled data with:

`node scripts/generate-guest-pdf-fonts.mjs`

jsPDF embeds the fonts into each generated document. The empty check-in square
is vector geometry, so it never depends on support for U+2610 in a font.
