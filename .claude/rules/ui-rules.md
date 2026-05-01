# Spec-Driven Platform V31 — UI Component Rules

> Loaded contextually by CLAUDE.md when the current task involves UI generation,
> component installation, or any work touching src/components/, src/app/, or packages/ui/.
> shadcn/ui is the ONLY permitted component library. No exceptions.

---

## UI COMPONENT RULES — MANDATORY FOR ALL UI GENERATION (NEW V29)

Every UI component, page, and layout MUST use the shadcn/ui ecosystem. No exceptions.
shadcn/ui is MIT licensed, free, open source, and the framework's locked UI component library.

```
1. shadcn/ui is the ONLY component library. NEVER import MUI, Ant Design, Chakra UI,
   Mantine, DaisyUI, or any other React UI library.
   Install components: npx shadcn@latest add [component]
   Full component list: https://ui.shadcn.com/docs/components
   Install via MCP: agents can use the shadcn MCP server to search and install components
   by natural language (e.g. "add a date picker and dialog to my project").

2. Charts: use shadcn/ui Chart component (built on Recharts — MIT, already a dependency).
   NEVER import Chart.js, D3.js, Victory, Nivo, or ApexCharts for standard dashboards.
   Exception: D3.js allowed ONLY for custom data visualizations not possible with Recharts
   (e.g. force-directed graphs, geo projections). Lock exception in DECISIONS_LOG.md.
   Chart docs: https://ui.shadcn.com/docs/components/radix/chart
   Chart examples: https://ui.shadcn.com/charts/area

3. Theming: ALL colors, spacing, and radii use shadcn/ui CSS variables
   (--primary, --secondary, --accent, --muted, --destructive, etc.) from globals.css.
   NEVER hardcode hex/rgb values in components. Dark mode uses the shadcn/ui
   dark mode toggle pattern (class-based, next-themes).
   Theming docs: https://ui.shadcn.com/docs/theming
   Dark mode docs: https://ui.shadcn.com/docs/dark-mode

4. Forms: use shadcn/ui Form component with React Hook Form + Zod validation.
   This mirrors the server-side pattern (tRPC + Zod). Client-side forms reuse
   the same Zod schemas from packages/shared/ — single source of validation truth.
   Form docs: https://ui.shadcn.com/docs/forms/react-hook-form

5. Data tables: use shadcn/ui Data Table component (built on TanStack Table).
   NEVER import @tanstack/react-table directly alongside shadcn — it is already wrapped.
   Data Table docs: https://ui.shadcn.com/docs/components/radix/data-table

6. Maps:
   DEFAULT: Leaflet.js + OpenStreetMap (simple pins/markers, zero API cost, MIT).
   CONDITIONAL (if PRODUCT.md declares advanced map features — routes, layers, vector tiles, 3D):
   → Use mapcn (MapLibre GL, shadcn-native, MIT, zero API key).
   → Install: npx shadcn@latest add https://mapcn.dev/maps/map.json
   → Auto-themes with shadcn/ui dark mode. Supports markers, controls, fly-to animations.
   → Decision MUST be in DECISIONS_LOG.md before Phase 4.
   mapcn docs: https://www.mapcn.dev/docs

7. Complex components beyond shadcn/ui primitives (Kanban, Gantt, Editor, Color Picker,
   Dropzone, Code Block, QR Code, Image Zoom):
   → Check Kibo UI registry FIRST (MIT, free forever, shadcn-native, 3.6K+ stars).
   → Install: npx kibo-ui add [component]
   → IF Kibo UI does not have it → build custom using shadcn/ui primitives + Radix UI.
   → NEVER import a standalone npm package for a UI pattern that Kibo UI or shadcn/ui covers.
   Kibo UI: https://www.kibo-ui.com/components

8. Blocks and page layouts: check shadcn/ui Blocks BEFORE building from scratch.
   Agents use the shadcn MCP server to search blocks by description.
   Blocks gallery: https://ui.shadcn.com/blocks
   Registry directory (community): https://ui.shadcn.com/docs/directory

9. Icons: lucide-react (already a shadcn/ui dependency). NEVER import heroicons,
   react-icons, font-awesome, or phosphor-icons alongside lucide.
   If a specific icon is missing from lucide → check lucide.dev for alternatives
   before adding any other icon library.

10. Monorepo integration: shadcn/ui supports monorepo setups natively.
    Reference: https://ui.shadcn.com/docs/monorepo
    In the framework's monorepo: packages/ui/ contains shared shadcn/ui components.
    App-specific components live in apps/[app]/src/components/.
    Phase 4 Part 2 runs shadcn init on the packages/ui workspace.
```

**shadcn/ui MCP Server** — enables agents to search and install components via natural language.
Installed by Bootstrap Step 10. Agents use it during Phase 4 scaffold and Phase 7 Feature Updates.
Example prompts to the MCP server:
  "Show me all available form components"
  "Add button, dialog, and card to my project"
  "Find a sidebar component from the shadcn registry"
Reference: https://ui.shadcn.com/docs/mcp

**Community registries** — optional, MIT, free:
  Kibo UI: https://www.kibo-ui.com — complex components (Kanban, Gantt, Editor, Dropzone)
  mapcn: https://www.mapcn.dev — shadcn-native maps (MapLibre GL, zero API key)
  awesome-shadcn-ui: https://github.com/birobirobiro/awesome-shadcn-ui — discovery list (200+ registries)
  shadcnregistry.com: https://shadcnregistry.com — searchable registry index

**NOT recommended (paid/freemium — do not use as defaults):**
  shadcn-studio (shadcnstudio.com) — MIT repo but commercial website with paid tiers. Use free GitHub components only if needed.
  shadcn.io — community registry with Pro paid tier. Free tier unclear boundaries.

---

## FILE DELIVERY RULES
