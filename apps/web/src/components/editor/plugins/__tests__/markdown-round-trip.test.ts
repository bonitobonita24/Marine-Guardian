// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createSlateEditor } from "platejs";
import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from "@platejs/basic-nodes";
import { BaseListPlugin } from "@platejs/list";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseTablePlugin, BaseTableCellPlugin, BaseTableRowPlugin } from "@platejs/table";
import { BaseCodeBlockPlugin, BaseCodeLinePlugin } from "@platejs/code-block";
import { MarkdownPlugin, deserializeMd, serializeMd } from "@platejs/markdown";
import remarkGfm from "remark-gfm";

/**
 * Scratch verification (not part of the CI suite — CMS_BUILD_PLAN.md W6
 * asks whether GFM tables/code survive a round trip through the SAME
 * remark-gfm-only MarkdownKit config used by CmsPlateEditor). Uses
 * createSlateEditor (static, non-React) exactly like the Context7-confirmed
 * Node.js snippet.
 */
describe("markdown round-trip (GFM)", () => {
  const editor = createSlateEditor({
    plugins: [
      BaseBasicBlocksPlugin,
      BaseBasicMarksPlugin,
      BaseListPlugin,
      BaseLinkPlugin,
      BaseTablePlugin,
      BaseTableRowPlugin,
      BaseTableCellPlugin,
      BaseCodeBlockPlugin,
      BaseCodeLinePlugin,
      MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
    ],
  });

  it("round-trips a GFM table", () => {
    const md = ["| a | b |", "| - | - |", "| 1 | 2 |", ""].join("\n");
    const value = deserializeMd(editor, md);
    const out = serializeMd(editor, { value });
    expect(out).toContain("| a | b |");
    expect(out).toContain("| 1 | 2 |");
  });

  it("round-trips a fenced code block", () => {
    const md = ["```ts", "const x = 1;", "```", ""].join("\n");
    const value = deserializeMd(editor, md);
    const out = serializeMd(editor, { value });
    expect(out).toContain("```");
    expect(out).toContain("const x = 1;");
  });

  it("round-trips strikethrough + task list (GFM extras)", () => {
    const md = ["~~gone~~", "", "- [x] done", "- [ ] todo", ""].join("\n");
    const value = deserializeMd(editor, md);
    const out = serializeMd(editor, { value });
    expect(out).toContain("~~gone~~");
    expect(out.toLowerCase()).toContain("done");
    expect(out.toLowerCase()).toContain("todo");
  });
});
