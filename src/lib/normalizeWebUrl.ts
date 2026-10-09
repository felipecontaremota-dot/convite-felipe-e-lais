// No application route uses query-string state. Remove untrusted search input before Router initializes.
// Administrative auth uses OTP entry, never URL access tokens or magic-link query parameters.
if (
  typeof document !== "undefined" &&
  typeof window !== "undefined" &&
  window.location.search
) {
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.hash,
  );
}
export {};
