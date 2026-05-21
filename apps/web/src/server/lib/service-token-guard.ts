/**
 * Constant-time service-token comparison for the /_print/* route guard.
 *
 * The token guards the print-only HTML render target consumed by the
 * marine-guardian-pdf-renderer Docker service (deploy/pdf-renderer/).
 * The guard runs inside Next.js middleware (Edge runtime) so we cannot use
 * node:crypto.timingSafeEqual — we implement a manual constant-time compare
 * that inspects the full length of the longer string.
 *
 * Returns true when the presented token matches the expected token,
 * false otherwise. Returns false defensively when either token is
 * null/undefined/empty — never grants access on a missing expected secret.
 */
export function verifyServiceToken(
  presented: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (presented == null || presented === "") return false;
  if (expected == null || expected === "") return false;
  if (presented.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
