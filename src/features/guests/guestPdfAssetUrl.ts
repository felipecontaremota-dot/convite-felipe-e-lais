// Metro may append a filename containing '&' to this query-style asset path.
// Encode the complete path as one value instead of letting URL split the name.
export function guestPdfAssetUrl(uri: string, base: string): URL {
  const marker = "?unstable_path=";
  const index = uri.indexOf(marker);
  const url = new URL(index < 0 ? uri : uri.slice(0, index), base);
  if (index >= 0)
    url.searchParams.set(
      "unstable_path",
      decodeURIComponent(uri.slice(index + marker.length)),
    );
  if (url.origin !== new URL(base).origin)
    throw Error("O monograma deve ser carregado do próprio aplicativo.");
  return url;
}
