"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import type { CmsDocTreeNode } from "@/server/trpc/routers/cmsDocs";
import { CmsPlateEditor, type CmsPlateEditorHandle } from "@/components/cms/cms-plate-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, FolderOpen, Plus, Trash2 } from "lucide-react";

/**
 * /admin/content/docs — full-body Plate editor for the DocPage tree
 * (CMS_BUILD_PLAN.md — W6). A flattened, indented list stands in for a
 * drag-reorder tree (the plan explicitly allows an `orderInParent` number
 * field instead of a heavy reorder UI — that's what this ships).
 */
export function AdminContentDocsClient() {
  const utils = trpc.useUtils();
  const tree = trpc.cmsDocs.tree.useQuery();
  const [selectedSlug, setSelectedSlug] = React.useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(false);

  const flatRows = React.useMemo(() => flattenTree(tree.data ?? []), [tree.data]);
  const allSlugs = React.useMemo(() => ["index", ...flatRows.map((r) => r.node.slug)], [flatRows]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Documentation</h1>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="size-4" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <CreateDocPageForm
                availableParents={allSlugs}
                onCreated={(slug) => {
                  setCreateOpen(false);
                  setSelectedSlug(slug);
                  void utils.cmsDocs.tree.invalidate();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        <Button
          variant={selectedSlug === "index" ? "secondary" : "ghost"}
          className="w-full justify-start"
          onClick={() => { setSelectedSlug("index"); }}
        >
          <FileText className="size-4" />
          index (/docs root)
        </Button>

        <ScrollArea className="h-[560px] rounded-md border border-input">
          <div className="p-1">
            {tree.isLoading && (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            )}
            {flatRows.map(({ node, depth }) => (
              <Button
                key={node.slug}
                variant={selectedSlug === node.slug ? "secondary" : "ghost"}
                className="w-full justify-start gap-1.5"
                style={{ paddingLeft: `${String(8 + depth * 16)}px` }}
                onClick={() => { setSelectedSlug(node.slug); }}
              >
                {node.kind === "folderIndex" ? (
                  <FolderOpen className="size-4 shrink-0" />
                ) : (
                  <FileText className="size-4 shrink-0" />
                )}
                <span className="truncate">{node.title}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div>
        {selectedSlug === undefined ? (
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-md border border-dashed border-input text-sm text-muted-foreground">
            Select a page to edit, or create a new one.
          </div>
        ) : (
          <DocPageEditor
            key={selectedSlug}
            slug={selectedSlug}
            onDeleted={() => { setSelectedSlug(undefined); }}
          />
        )}
      </div>
    </div>
  );
}

interface FlatRow {
  node: CmsDocTreeNode;
  depth: number;
}

function flattenTree(nodes: CmsDocTreeNode[], depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0) {
      rows.push(...flattenTree(node.children, depth + 1));
    }
  }
  return rows;
}

function DocPageEditor({
  slug,
  onDeleted,
}: {
  slug: string;
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const page = trpc.cmsDocs.getBySlug.useQuery({ slug });
  const editorRef = React.useRef<CmsPlateEditorHandle>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [orderInParent, setOrderInParent] = React.useState(0);
  const [published, setPublished] = React.useState(true);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (page.data) {
      setTitle(page.data.title);
      setDescription(page.data.description ?? "");
      setOrderInParent(page.data.orderInParent);
      setPublished(page.data.published);
    }
  }, [page.data]);

  const update = trpc.cmsDocs.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.cmsDocs.tree.invalidate();
      void utils.cmsDocs.getBySlug.invalidate({ slug });
      setTimeout(() => { setSaved(false); }, 2000);
    },
  });

  const del = trpc.cmsDocs.delete.useMutation({
    onSuccess: () => {
      void utils.cmsDocs.tree.invalidate();
      onDeleted();
    },
  });

  if (page.isLoading || !page.data) {
    return <p className="text-sm text-muted-foreground">Loading page…</p>;
  }

  const handleSave = () => {
    const bodyMarkdown = editorRef.current?.getMarkdown() ?? page.data.bodyMarkdown;
    update.mutate({
      slug,
      title,
      description: description.length > 0 ? description : null,
      orderInParent,
      published,
      bodyMarkdown,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">{slug}</Badge>
          <Badge variant={page.data.kind === "folderIndex" ? "secondary" : "outline"}>
            {page.data.kind}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-muted-foreground">Saved</span>}
          <Button
            size="sm"
            variant="destructive"
            disabled={del.isPending || slug === "index"}
            onClick={() => {
              if (confirm(`Delete "${slug}"? This cannot be undone.`)) {
                del.mutate({ slug });
              }
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <Button size="sm" disabled={update.isPending} onClick={handleSave}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-title">Title</Label>
          <Input id="doc-title" value={title} onChange={(e) => { setTitle(e.target.value); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-order">Order in parent</Label>
          <Input
            id="doc-order"
            type="number"
            min={0}
            value={orderInParent}
            onChange={(e) => { setOrderInParent(Number(e.target.value)); }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="doc-description">Description</Label>
        <Textarea
          id="doc-description"
          value={description}
          onChange={(e) => { setDescription(e.target.value); }}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="doc-published" checked={published} onCheckedChange={setPublished} />
        <Label htmlFor="doc-published">Published</Label>
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <CmsPlateEditor
          ref={editorRef}
          initialMarkdown={page.data.bodyMarkdown}
          scope="docs"
          placeholder="Write the page content…"
        />
      </div>
    </div>
  );
}

function CreateDocPageForm({
  availableParents,
  onCreated,
}: {
  availableParents: string[];
  onCreated: (slug: string) => void;
}) {
  const [parentSlug, setParentSlug] = React.useState("index");
  const [slugSegment, setSlugSegment] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<"page" | "folderIndex">("page");
  const [error, setError] = React.useState<string | null>(null);

  const create = trpc.cmsDocs.create.useMutation({
    onSuccess: (row) => { onCreated(row.slug); },
    onError: (err) => { setError(err.message); },
  });

  const fullSlug = parentSlug === "index" ? slugSegment : `${parentSlug}/${slugSegment}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>New doc page</DialogTitle>
        <DialogDescription>
          Creates a page under the selected parent. The slug becomes the /docs URL.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-doc-parent">Parent</Label>
          <Select value={parentSlug} onValueChange={setParentSlug}>
            <SelectTrigger id="new-doc-parent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableParents.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-doc-slug">Slug segment</Label>
          <Input
            id="new-doc-slug"
            value={slugSegment}
            onChange={(e) => { setSlugSegment(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }}
            placeholder="my-new-page"
          />
          {slugSegment.length > 0 && (
            <p className="text-xs text-muted-foreground">Full slug: {fullSlug}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-doc-title">Title</Label>
          <Input id="new-doc-title" value={title} onChange={(e) => { setTitle(e.target.value); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-doc-kind">Kind</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v as "page" | "folderIndex"); }}>
            <SelectTrigger id="new-doc-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">page</SelectItem>
              <SelectItem value="folderIndex">folderIndex</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error !== null && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button
          disabled={slugSegment.length === 0 || title.length === 0 || create.isPending}
          onClick={() => {
            setError(null);
            create.mutate({
              slug: fullSlug,
              parentSlug,
              kind,
              title,
              orderInParent: 999,
              bodyMarkdown: `# ${title}\n`,
              published: true,
            });
          }}
        >
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </>
  );
}
