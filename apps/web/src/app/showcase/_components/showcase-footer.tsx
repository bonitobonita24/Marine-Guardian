import Link from "next/link";

// Mirrors apps/web/package.json "version". Git tags remain the source of truth
// (versioning-standard.md); this is the display mark for the showcase footer.
const APP_VERSION = "v1.1.0";

export function ShowcaseFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:items-start">            <img
              src="/marine-guardian-logo.png"
              alt="Marine Guardian — Command Center"
              className="h-9 w-auto"
            />
            <p className="text-caption text-muted-foreground">
              Real-time operations intelligence for marine protected areas
            </p>
          </div>

          <div className="text-caption text-muted-foreground sm:text-right">
            <p>
              <Link
                href="/docs"
                className="transition-colors hover:text-foreground hover:underline"
              >
                Documentation
              </Link>
            </p>
            <p>{APP_VERSION}</p>
            <a
              href="https://www.powerbyteitsolutions.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground hover:underline"
            >
              Developed by Powerbyte IT Solutions
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
