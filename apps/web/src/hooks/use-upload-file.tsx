import * as React from "react";

/**
 * CMS media upload hook (CMS_BUILD_PLAN.md — W6). Replaces the shadcn @plate
 * kit's stock uploadthing-backed `useUploadFile` with one that POSTs raw
 * image bytes to our own platform-admin-gated `/api/cms/media` route
 * (apps/web/src/app/api/cms/media/route.ts — W3), and shapes the response to
 * the `{ url, name }` fields the kit's `PlaceholderElement`
 * (components/ui/media-placeholder-node.tsx) already reads via `uploadedFile`.
 *
 * Used for BOTH toolbar "upload from computer" AND Ctrl+V paste / drag-drop —
 * `PlaceholderPlugin` funnels all three entry points through the same
 * placeholder-element upload flow, so one hook covers all of them.
 *
 * `CmsUploadScopeContext` lets a page wrap its editor tree in a scope
 * ("docs" | "showcase") WITHOUT having to thread a prop through the kit's
 * unmodified PlaceholderElement / MediaToolbarButton, which both call
 * `useUploadFile()` with no arguments.
 */

export interface UploadedFile {
  key: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

type CmsUploadScope = "docs" | "showcase";

const CmsUploadScopeContext = React.createContext<CmsUploadScope>("docs");

export function CmsUploadScopeProvider({
  scope,
  children,
}: {
  scope: CmsUploadScope;
  children: React.ReactNode;
}) {
  return (
    <CmsUploadScopeContext.Provider value={scope}>
      {children}
    </CmsUploadScopeContext.Provider>
  );
}

interface UseUploadFileProps {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong, please try again later.";
}

export function useUploadFile({
  onUploadComplete,
  onUploadError,
}: UseUploadFileProps = {}) {
  const scope = React.useContext(CmsUploadScopeContext);
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadFile(file: File): Promise<UploadedFile | undefined> {
    setIsUploading(true);
    setUploadingFile(file);
    setProgress(10);

    try {
      const res = await fetch(`/api/cms/media?scope=${scope}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      setProgress(90);

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${String(res.status)})`);
      }

      const data = (await res.json()) as { url: string };

      const result: UploadedFile = {
        key: data.url,
        url: data.url,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      setProgress(100);
      setUploadedFile(result);
      onUploadComplete?.(result);
      return result;
    } catch (error) {
      onUploadError?.(error);
      return undefined;
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile,
    uploadingFile,
  };
}
