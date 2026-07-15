import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function DocsNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-1 text-muted-foreground">
          This documentation page doesn&apos;t exist yet.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/docs">Back to docs home</Link>
      </Button>
    </div>
  );
}
