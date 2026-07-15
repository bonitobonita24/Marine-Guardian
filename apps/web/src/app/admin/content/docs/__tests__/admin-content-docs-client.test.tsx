// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { CmsDocTreeNode } from "@/server/trpc/routers/cmsDocs";

interface DocPageRow {
  id: string;
  slug: string;
  parentSlug: string | null;
  kind: "page" | "folderIndex";
  title: string;
  description: string | null;
  orderInParent: number;
  bodyMarkdown: string;
  published: boolean;
}

const { stubs, mutateMock } = vi.hoisted(() => {
  const s: {
    treeData: CmsDocTreeNode[] | undefined;
    treeIsLoading: boolean;
    pageData: DocPageRow | undefined;
    pageIsLoading: boolean;
  } = {
    treeData: [],
    treeIsLoading: false,
    pageData: undefined,
    pageIsLoading: false,
  };
  return { stubs: s, mutateMock: vi.fn() };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      cmsDocs: {
        tree: { invalidate: vi.fn() },
        getBySlug: { invalidate: vi.fn() },
      },
    }),
    cmsDocs: {
      tree: { useQuery: () => ({ data: stubs.treeData, isLoading: stubs.treeIsLoading }) },
      getBySlug: {
        useQuery: () => ({ data: stubs.pageData, isLoading: stubs.pageIsLoading }),
      },
      update: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            mutateMock(input);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

// Stub the real Plate editor entirely -- CmsPlateEditor mounts a full
// Slate/Plate DOM tree (covered by its own dedicated mount test,
// components/cms/__tests__/cms-plate-editor.test.tsx). Here we only need to
// prove the Save button reads the ref's getMarkdown() and calls
// cmsDocs.update with the right payload shape (CMS_BUILD_PLAN.md — W6).
vi.mock("@/components/cms/cms-plate-editor", () => ({
  CmsPlateEditor: ({ ref }: { ref?: { current: unknown } }) => {
    if (ref) {
      ref.current = { getMarkdown: () => "# Edited body\n" };
    }
    return <div data-testid="stub-plate-editor" />;
  },
}));

import { AdminContentDocsClient } from "../admin-content-docs-client";

const sampleTree: CmsDocTreeNode[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Intro page",
    kind: "page",
    url: "/docs/getting-started",
    orderInParent: 0,
    children: [],
  },
];

describe("AdminContentDocsClient", () => {
  beforeEach(() => {
    stubs.treeData = sampleTree;
    stubs.treeIsLoading = false;
    stubs.pageData = {
      id: "doc-1",
      slug: "getting-started",
      parentSlug: "index",
      kind: "page",
      title: "Getting Started",
      description: "Intro page",
      orderInParent: 0,
      bodyMarkdown: "# Getting Started\n",
      published: true,
    };
    stubs.pageIsLoading = false;
    mutateMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the doc tree list and the index root entry", () => {
    const { getByText } = render(<AdminContentDocsClient />);
    expect(getByText("index (/docs root)")).toBeTruthy();
    expect(getByText("Getting Started")).toBeTruthy();
  });

  it("selecting a page loads its editor with title + published fields", async () => {
    const { getByText, getByDisplayValue } = render(<AdminContentDocsClient />);
    fireEvent.click(getByText("Getting Started"));
    await waitFor(() => {
      expect(getByDisplayValue("Getting Started")).toBeTruthy();
    });
  });

  it("Save calls cmsDocs.update.mutate with the slug, edited fields, and the editor's markdown", async () => {
    const { getByText, getByRole } = render(<AdminContentDocsClient />);
    fireEvent.click(getByText("Getting Started"));

    await waitFor(() => {
      expect(getByRole("button", { name: /^Save$/ })).toBeTruthy();
    });

    fireEvent.click(getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledTimes(1);
    });
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "getting-started",
        title: "Getting Started",
        bodyMarkdown: "# Edited body\n",
        published: true,
      }),
    );
  });
});
