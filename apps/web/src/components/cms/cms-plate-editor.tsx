'use client';

import * as React from 'react';

import { deserializeMd } from '@platejs/markdown';
import { KEYS } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import {
  Bold,
  Code as CodeIcon,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react';

import { BasicNodesKit } from '@/components/editor/plugins/basic-nodes-kit';
import { CodeBlockKit } from '@/components/editor/plugins/code-block-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { MediaKit } from '@/components/editor/plugins/media-kit';
import { TableKit } from '@/components/editor/plugins/table-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { LinkToolbarButton } from '@/components/ui/link-toolbar-button';
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
} from '@/components/ui/list-toolbar-button';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';
import { MediaToolbarButton } from '@/components/ui/media-toolbar-button';
import { TableToolbarButton } from '@/components/ui/table-toolbar-button';
import { Toolbar, ToolbarButton, ToolbarGroup } from '@/components/ui/toolbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CmsUploadScopeProvider } from '@/hooks/use-upload-file';
import { cn } from '@/lib/utils';

/**
 * CMS WYSIWYG editor (CMS_BUILD_PLAN.md — W6). One editor instance for BOTH
 * the /admin/content/docs full-body editor and the /admin/content/showcase
 * per-field rich text fields.
 *
 * Markdown round-trip: `deserializeMd(editor, markdown)` loads the initial
 * value (matches the Node.js snippet pattern — confirmed via Context7,
 * /udecode/plate "Read and Write Markdown with Plate"); `getMarkdown()`
 * (exposed via ref) calls `editor.api.markdown.serialize()` to read the
 * current value back out as GFM markdown for the Save mutation
 * (cmsDocs.update / cmsShowcase.update).
 *
 * Image paste/drop/upload: PlaceholderPlugin + ImagePlugin (MediaKit) handle
 * Ctrl+V paste and drag-drop out of the box — both funnel through
 * PlaceholderElement (components/ui/media-placeholder-node.tsx), which calls
 * `useUploadFile()` (hooks/use-upload-file.ts, rewritten for W6 to POST to
 * /api/cms/media instead of uploadthing) and finishes by removing the
 * placeholder node and inserting the real image node with the returned URL.
 * `CmsUploadScopeProvider` tags every upload from this editor instance with
 * the docs/showcase scope (CmsMedia.scope column) without having to modify
 * the kit's unmodified PlaceholderElement/MediaToolbarButton components.
 */

const EDITOR_PLUGINS = [
  ...BasicNodesKit,
  ...ListKit,
  ...LinkKit,
  ...TableKit,
  ...MediaKit,
  ...CodeBlockKit,
  ...MarkdownKit,
];

export interface CmsPlateEditorHandle {
  getMarkdown: () => string;
}

interface CmsPlateEditorProps {
  /** Initial GFM markdown body. Only read on mount — remount via `key` to load a different document. */
  initialMarkdown: string;
  scope: 'docs' | 'showcase';
  placeholder?: string;
  /** Compact variant for showcase per-field editors (shorter min-height, no full-page chrome). */
  variant?: 'default' | 'compact';
  className?: string;
  onChange?: (markdown: string) => void;
}

export const CmsPlateEditor = React.forwardRef<CmsPlateEditorHandle, CmsPlateEditorProps>(
  function CmsPlateEditor(
    { initialMarkdown, scope, placeholder, variant = 'default', className, onChange },
    ref,
  ) {
    const editor = usePlateEditor({
      plugins: EDITOR_PLUGINS,
      value: (editor) => deserializeMd(editor, initialMarkdown),
    });

    React.useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => editor.api.markdown.serialize(),
      }),
      [editor],
    );

    const handlePlateChange = React.useCallback(() => {
      onChange?.(editor.api.markdown.serialize());
    }, [editor, onChange]);

    return (
      <TooltipProvider>
      <CmsUploadScopeProvider scope={scope}>
        <Plate editor={editor} onChange={handlePlateChange}>
          <div className={cn('rounded-md border border-input', className)}>
            <Toolbar className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
              <ToolbarGroup>
                <ToolbarButton tooltip="Heading 1" onClick={() => { editor.tf.h1?.toggle(); }}>
                  <Heading1 />
                </ToolbarButton>
                <ToolbarButton tooltip="Heading 2" onClick={() => { editor.tf.h2?.toggle(); }}>
                  <Heading2 />
                </ToolbarButton>
                <ToolbarButton tooltip="Heading 3" onClick={() => { editor.tf.h3?.toggle(); }}>
                  <Heading3 />
                </ToolbarButton>
                <ToolbarButton
                  tooltip="Quote"
                  onClick={() => {
                    editor.tf.toggleBlock(KEYS.blockquote);
                  }}
                >
                  <Quote />
                </ToolbarButton>
                <ToolbarButton
                  tooltip="Code block"
                  onClick={() => {
                    editor.tf.toggleBlock(KEYS.codeBlock);
                  }}
                >
                  <FileCode />
                </ToolbarButton>
              </ToolbarGroup>

              <ToolbarGroup>
                <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
                  <Bold />
                </MarkToolbarButton>
                <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
                  <Italic />
                </MarkToolbarButton>
                <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)">
                  <UnderlineIcon />
                </MarkToolbarButton>
                <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough">
                  <Strikethrough />
                </MarkToolbarButton>
                <MarkToolbarButton nodeType={KEYS.code} tooltip="Inline code">
                  <CodeIcon />
                </MarkToolbarButton>
              </ToolbarGroup>

              <ToolbarGroup>
                <BulletedListToolbarButton />
                <NumberedListToolbarButton />
                <LinkToolbarButton />
              </ToolbarGroup>

              {variant === 'default' && (
                <ToolbarGroup>
                  <MediaToolbarButton nodeType={KEYS.img}>
                    <ImageIcon />
                  </MediaToolbarButton>
                  <TableToolbarButton />
                </ToolbarGroup>
              )}
            </Toolbar>

            <EditorContainer className={variant === 'compact' ? 'h-[220px]' : 'h-[520px]'}>
              <Editor variant="none" placeholder={placeholder ?? 'Type…'} className="px-4 py-3" />
            </EditorContainer>
          </div>
        </Plate>
      </CmsUploadScopeProvider>
      </TooltipProvider>
    );
  },
);
