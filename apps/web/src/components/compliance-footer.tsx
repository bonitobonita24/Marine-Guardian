/**
 * ComplianceFooter — V32.9 / RA 10173 (Marine Guardian).
 *
 * HONEST compliance footer. Design-claim chips reflect how the system is
 * actually built; certification badges are opt-in flags (all OFF by default —
 * rendering a badge you don't hold is a misrepresentation, so keep them false
 * until the organisation actually holds the certification).
 *
 * Server-safe: no hooks, pure JSX. Drop into any server page or client component.
 */

const COMPLIANCE_CONFIG = {
  /** Design claims — how the app is built. Safe to display. */
  designClaims: {
    securityByDefault: true,
    phDpaAligned: true,
    wcagTarget: true,
  },
  /**
   * Held certifications — OFF unless the organisation has obtained them.
   * Do NOT flip these on without a real certificate.
   */
  certBadges: {
    iso27001: false,
    soc2: false,
    pci: false,
  },
};

const DESIGN_CLAIM_LABELS: Record<keyof typeof COMPLIANCE_CONFIG.designClaims, string> = {
  securityByDefault: "Built with security by default",
  phDpaAligned: "Aligned with PH Data Privacy Act (RA 10173)",
  wcagTarget: "Targets WCAG 2.2 AA",
};

const CERT_BADGE_LABELS: Record<keyof typeof COMPLIANCE_CONFIG.certBadges, string> = {
  iso27001: "ISO 27001 Certified",
  soc2: "SOC 2 Type II",
  pci: "PCI DSS Compliant",
};

export function ComplianceFooter() {
  const year = new Date().getFullYear();

  const activeDesignClaims = (
    Object.keys(COMPLIANCE_CONFIG.designClaims) as Array<
      keyof typeof COMPLIANCE_CONFIG.designClaims
    >
  ).filter((key) => COMPLIANCE_CONFIG.designClaims[key]);

  const activeCertBadges = (
    Object.keys(COMPLIANCE_CONFIG.certBadges) as Array<
      keyof typeof COMPLIANCE_CONFIG.certBadges
    >
  ).filter((key) => COMPLIANCE_CONFIG.certBadges[key]);

  return (
    <footer
      aria-label="Compliance and legal information"
      className="border-t border-border bg-background px-6 py-8"
    >
      <div className="mx-auto max-w-5xl space-y-4 text-center">
        {activeDesignClaims.length > 0 && (
          <ul
            aria-label="Design and compliance claims"
            className="flex flex-wrap justify-center gap-2 list-none p-0"
          >
            {activeDesignClaims.map((key) => (
              <li
                key={key}
                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
              >
                {DESIGN_CLAIM_LABELS[key]}
              </li>
            ))}
          </ul>
        )}

        {activeCertBadges.length > 0 && (
          <ul
            aria-label="Held certifications"
            className="flex flex-wrap justify-center gap-2 list-none p-0"
          >
            {activeCertBadges.map((key) => (
              <li
                key={key}
                className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {CERT_BADGE_LABELS[key]}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          <a
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Privacy Notice
          </a>
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          &copy; {year} Marine Guardian
        </p>
      </div>
    </footer>
  );
}
