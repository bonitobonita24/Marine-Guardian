import type { Metadata } from "next";
import Link from "next/link";
import { ComplianceFooter } from "@/components/compliance-footer";

export const metadata: Metadata = {
  title: "Privacy Notice · Marine Guardian",
  description:
    "How Marine Guardian collects, uses, retains, and protects personal data under the Philippine Data Privacy Act (RA 10173).",
};

/**
 * Public Privacy Notice — RA 10173 (PH Data Privacy Act) transparency page.
 * Server component, no auth required. WCAG 2.2 AA: skip-link, semantic landmarks,
 * heading order, focus-visible links, 44px touch targets on interactive elements.
 *
 * NOTE (owner-pending — do NOT treat as final):
 *   - DPO contact below is a placeholder (bonitobonita24@gmail.com). [TODO-owner]
 *   - NPC registration number / PIA reference not yet issued. [TODO-owner]
 *   - Lawful-basis fine-tuning per processing activity is provisional. [TODO-owner]
 */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold text-foreground">
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#privacy-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-lg font-semibold text-foreground">
            Marine Guardian
          </span>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main
        id="privacy-main"
        className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10"
      >
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Privacy Notice</h1>
          <p className="text-sm text-muted-foreground">
            How Marine Guardian processes personal data under the Philippine Data
            Privacy Act of 2012 (Republic Act No. 10173) and the rules of the
            National Privacy Commission (NPC).
          </p>
        </div>

        <Section id="who-we-are" title="Who we are">
          <p>
            Marine Guardian is a marine-conservation patrol-management platform
            operated by the conservation organisation deploying it (the
            &ldquo;Personal Information Controller&rdquo;). This notice explains
            how personal data of platform users — coordinators, rangers, and
            operators — is handled.
          </p>
        </Section>

        <Section id="data-we-process" title="What personal data we process">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account &amp; profile:</strong>{" "}
              name, email address, role, and language preference.
            </li>
            <li>
              <strong className="text-foreground">Operational activity:</strong>{" "}
              patrol schedules you are assigned to, fuel entries you log, and
              report exports you request.
            </li>
            <li>
              <strong className="text-foreground">Security &amp; audit:</strong>{" "}
              audit-log records of actions you perform, including timestamps and
              (where available) IP address for security purposes.
            </li>
          </ul>
          <p>
            Marine Guardian also processes wildlife, patrol-track, and incident
            data that generally does not identify platform users. Where ranger
            identities appear in conservation records, that data is handled under
            this notice.
          </p>
        </Section>

        <Section id="lawful-basis" title="Why we process it (lawful basis)">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Contract:</strong> to provide
              your account and the platform you signed up to use.
            </li>
            <li>
              <strong className="text-foreground">Legitimate interest:</strong>{" "}
              conservation operations, patrol coordination, and reporting.
            </li>
            <li>
              <strong className="text-foreground">Legal obligation:</strong>{" "}
              maintaining security and audit records.
            </li>
          </ul>
          <p className="italic">
            Lawful-basis details per processing activity are being finalised with
            the organisation&rsquo;s Data Protection Officer.
          </p>
        </Section>

        <Section id="retention" title="How long we keep it">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Audit &amp; security logs:</strong>{" "}
              5 years.
            </li>
            <li>
              <strong className="text-foreground">
                Operational / patrol / observation data:
              </strong>{" "}
              3 years.
            </li>
          </ul>
          <p>
            Periods follow the storage-limitation and disposal principles of RA
            10173 (§11(e), §19). Some records may be retained longer where a legal
            hold or statutory obligation applies.
          </p>
        </Section>

        <Section id="your-rights" title="Your rights as a data subject">
          <p>Under RA 10173 §16 and §18 you may:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Be informed</strong> about how
              your data is processed.
            </li>
            <li>
              <strong className="text-foreground">Access</strong> a copy of the
              personal data we hold about you.
            </li>
            <li>
              <strong className="text-foreground">Rectify</strong> inaccurate or
              outdated personal data.
            </li>
            <li>
              <strong className="text-foreground">Object</strong> to certain
              processing of your data.
            </li>
            <li>
              <strong className="text-foreground">Request erasure or blocking</strong>{" "}
              of your data, subject to legal-retention exceptions.
            </li>
            <li>
              <strong className="text-foreground">Data portability</strong> — receive
              your data in a structured, machine-readable format.
            </li>
          </ul>
          <p>
            Signed-in users can exercise the access, portability, rectification,
            objection, and erasure-request rights directly from{" "}
            <Link
              href="/settings"
              className="font-medium text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Settings &rarr; Data &amp; Privacy
            </Link>
            . We respond within{" "}
            <strong className="text-foreground">15 calendar days</strong> of a
            request.
          </p>
        </Section>

        <Section id="breach" title="Data-breach notification">
          <p>
            In the event of a personal-data breach that is likely to give rise to
            real risk to your rights, Marine Guardian and the controller will
            notify the National Privacy Commission and affected data subjects in
            line with NPC Circular 16-03 (within 72 hours of knowledge of the
            breach, with a full written report following).
          </p>
        </Section>

        <Section id="contact" title="Contact &amp; Data Protection Officer">
          <p>
            For privacy questions or to exercise your rights, contact the Data
            Protection Officer:
          </p>
          <p>
            <a
              href="mailto:bonitobonita24@gmail.com"
              className="font-medium text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              bonitobonita24@gmail.com
            </a>{" "}
            <span className="text-xs">(interim contact — to be confirmed)</span>
          </p>
          <p>
            You also have the right to lodge a complaint with the National Privacy
            Commission (
            <a
              href="https://privacy.gov.ph"
              className="text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              rel="noopener noreferrer"
              target="_blank"
            >
              privacy.gov.ph
            </a>
            ).
          </p>
        </Section>
      </main>

      <ComplianceFooter />
    </div>
  );
}
