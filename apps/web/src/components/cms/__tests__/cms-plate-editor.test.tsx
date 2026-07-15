// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createRef } from "react";

// jsdom lacks these DOM APIs that Radix (Toolbar/Tooltip) and the Plate media
// kit's resize handles touch on mount (CMS_BUILD_PLAN.md — W6). Polyfill just
// enough to allow a mount, mirroring how other Plate/Radix test suites stub
// these in a jsdom environment.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      value: ResizeObserverStub,
      writable: true,
      configurable: true,
    });
  }
  if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

vi.mock("@/hooks/use-upload-file", () => ({
  useUploadFile: () => ({
    isUploading: false,
    progress: 0,
    uploadedFile: undefined,
    uploadFile: vi.fn(),
    uploadingFile: undefined,
  }),
  CmsUploadScopeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { CmsPlateEditor, type CmsPlateEditorHandle } from "../cms-plate-editor";

describe("CmsPlateEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts and renders a toolbar + editable content area for docs scope", () => {
    const { container } = render(
      <CmsPlateEditor initialMarkdown="# Hello\n\nWorld" scope="docs" />,
    );
    // The editable Slate content area renders with contenteditable.
    expect(container.querySelector('[contenteditable="true"]')).toBeTruthy();
    // Toolbar renders (role="toolbar" from @radix-ui/react-toolbar).
    expect(container.querySelector('[role="toolbar"]')).toBeTruthy();
  });

  it("mounts in compact variant for showcase scope without the media/table toolbar group", () => {
    const { container } = render(
      <CmsPlateEditor initialMarkdown="Some body copy" scope="showcase" variant="compact" />,
    );
    expect(container.querySelector('[contenteditable="true"]')).toBeTruthy();
  });

  it("exposes getMarkdown() via ref returning the deserialized-then-reserialized body", () => {
    const ref = createRef<CmsPlateEditorHandle>();
    render(<CmsPlateEditor ref={ref} initialMarkdown="Hello world" scope="docs" />);
    expect(ref.current).toBeTruthy();
    const markdown = ref.current?.getMarkdown();
    expect(typeof markdown).toBe("string");
    expect(markdown).toContain("Hello world");
  });
});
