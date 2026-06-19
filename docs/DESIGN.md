---
# 2026-06-15: design baseline reconciled to shipped shadcn stock neutral dark theme
# (owner-approved reskin, commits e6ba66b/b8bbab4/b100389).
# Meta Dark Mode (blue #0866FF, surfaces #18191A/#242526/#3A3B3C) has been replaced
# by shadcn default dark neutral (monochrome). CSS vars are the source of truth;
# hex approximations below are for mockup/design tool use only.
name: Marine Guardian — Command Center
description: shadcn stock neutral dark design system for marine protected area operations intelligence. Monochrome neutral dark surfaces (no blue accent), pill-shaped interactive elements, data-dense dashboard aesthetics optimized for 24/7 command center monitoring on large displays.
colors:
  # Core surface tiers — shadcn default dark neutral (hsl → hex approximations)
  background: "#0A0A0A"          # --background: 0 0% 3.9%  (page bg, input bg, Kanban card bodies)
  card: "#0A0A0A"                # --card: 0 0% 3.9%        (same as background — flat card surface)
  surface: "#0A0A0A"             # alias: card (cards, sidebar, header, modals)
  elevated: "#262626"            # --secondary/--muted/--accent/--border/--input: 0 0% 14.9% (hover, table headers, dropdowns)
  border: "#262626"              # --border: 0 0% 14.9%
  input: "#262626"               # --input: 0 0% 14.9%
  # Text
  text-primary: "#FAFAFA"        # --foreground: 0 0% 98%
  text-secondary: "#A3A3A3"      # --muted-foreground: 0 0% 63.9%
  text-muted: "#A3A3A3"          # --muted-foreground (same tier)
  # Primary — neutral white (no blue accent in shadcn stock dark)
  primary: "#FAFAFA"             # --primary: 0 0% 98%
  primary-foreground: "#171717"  # --primary-foreground: 0 0% 9%
  primary-light: "rgba(250,250,250,0.12)"  # selected/hover tint (neutral equivalent of old blue-light)
  # Ring
  ring: "#D4D4D4"                # --ring: 0 0% 83.1%
  # Semantic colors — operational meaning preserved (unchanged from original)
  success: "#31A24C"             # --success: 145 54% 41%  — active/online/resolved
  success-bg: "rgba(49,162,76,0.15)"
  danger: "#F0284A"              # --destructive: 0 62.8% 30.6% (approx) — critical alerts, destructive actions
  danger-bg: "rgba(240,40,74,0.15)"
  warning: "#E8912D"             # --warning: 25 80% 54%   — high priority, stale data
  warning-bg: "rgba(232,145,45,0.15)"
  caution: "#F7D154"             # --caution: 44 92% 60%   — medium priority
  caution-bg: "rgba(247,209,84,0.15)"
  info: "#00C9DB"                # --info: 183 100% 43%    — patrol tracks, informational
  # Chart tokens (added in shadcn neutral reskin)
  chart-1: "hsl(220 70% 50%)"
  chart-2: "hsl(160 60% 45%)"
  chart-3: "hsl(30 80% 55%)"
  chart-4: "hsl(280 65% 60%)"
  chart-5: "hsl(340 75% 55%)"
typography:
  display:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
  heading:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  subheading:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "9px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.5px"
    textTransform: "uppercase"
  kpi-value:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    fontVariantNumeric: "tabular-nums"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    fontSize: "12px"
    fontWeight: 600
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    border: "1px solid {colors.border}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.border}"
    padding: "{spacing.xl}"
  badge:
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    fontSize: "10px"
    fontWeight: 600
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    fontSize: "13px"
  table-header:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.text-muted}"
    fontSize: "10px"
    fontWeight: 600
    textTransform: "uppercase"
    letterSpacing: "0.5px"
  table-cell:
    textColor: "{colors.text-primary}"
    fontSize: "12px"
    padding: "10px 12px"
    borderBottom: "1px solid {colors.border}"
  kpi-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.border}"
    padding: "12px 16px"
  alert-panel:
    backgroundColor: "{colors.danger-bg}"
    border: "1px solid rgba(240,40,74,0.25)"
  layer-toggle:
    backgroundColor: "rgba(24,25,26,0.85)"
    rounded: "{rounded.md}"
    backdropFilter: "blur(8px)"
  file-upload-dropzone:
    backgroundColor: "{colors.background}"
    border: "2px dashed {colors.border}"
    borderRadius: "{rounded.lg}"
    padding: "{spacing.xl}"
    hoverBorder: "2px dashed {colors.ring}"
    activeBackground: "{colors.primary-light}"
    fontSize: "12px"
    iconSize: "24px"
  currency-display:
    fontVariantNumeric: "tabular-nums"
    fontWeight: 600
    format: "locale-aware — IDR uses dot thousands (Rp 3.200.000), PHP uses comma thousands (₱45,000), MYR uses comma thousands (RM 12,500)"
    note: "Currency symbol and format derived from tenant.currency field at render time. Stored as raw number in database."
---

## Overview

shadcn Stock Neutral Dark — Command Center Operations Intelligence. The design language uses the verbatim shadcn default dark neutral palette: `#0A0A0A` background (hsl 0 0% 3.9%), `#262626` elevated/muted surfaces (hsl 0 0% 14.9%), monochrome white primary. There is no blue accent — primary interactive elements use neutral white (`#FAFAFA`) on dark background. Semantic colors (green, red, orange, yellow) are used exclusively for operational status and priority communication — never decoratively.

> **Theme history:** This design was originally "Meta Dark Mode" (Meta Blue `#0866FF` accent, surfaces `#18191A`/`#242526`/`#3A3B3C`). On 2026-06-15, the owner approved a full reskin to shadcn stock neutral dark (commits e6ba66b/b8bbab4/b100389, merged to main). This document reflects the shipped theme.

The aesthetic is optimized for two contexts: (1) a 100-inch wall-mounted TV displaying the War Room 24/7, where high contrast and large KPI values matter, and (2) standard desk monitors where operators work with dense data tables and forms.

## Colors

The palette is built on two neutral surface tiers (background and elevated) with no brand accent color.

- **Background (`#0A0A0A`, `--background: 0 0% 3.9%`):** The darkest layer. Full-page backgrounds, card surfaces (`--card` shares this value), input field backgrounds, and Kanban card bodies.
- **Elevated (`#262626`, `--secondary/--muted/--accent/--border/--input: 0 0% 14.9%`):** Hover states, table headers, dropdown backgrounds, layer toggle panels. The only surface-depth distinction — no mid-tier.
- **Border (`#262626`, `--border: 0 0% 14.9%`):** All borders, dividers, table row separators. Same hue as elevated — cards read as depth-separated by context, not color step.
- **Primary (neutral white `#FAFAFA`, `--primary: 0 0% 98%`):** Primary interactive elements — buttons, active nav items, selected states. No blue accent. Use `primary-light` (12% white opacity) for selected backgrounds.
- **Success (`#31A24C`, `--success: 145 54% 41%`):** Active/online/resolved states, sync health indicators, "connected" badges. Never for decoration.
- **Danger (`#F0284A`, `--destructive: 0 62.8% 30.6%`):** Critical alerts, unacknowledged events, destructive actions. The alert panel uses `danger-bg` (15% opacity) with a subtle red border.
- **Warning (`#E8912D`, `--warning: 25 80% 54%`):** High priority events, stale data indicators, pending states.
- **Caution (`#F7D154`, `--caution: 44 92% 60%`):** Medium priority, mockup banners, attention-needed-but-not-urgent.
- **Info (`#00C9DB`, `--info: 183 100% 43%`):** Patrol tracks (seaborne), secondary data accent, informational highlights.

### Rules
- Never use more than one accent color per interactive element.
- Semantic colors (success/danger/warning) are reserved for status communication only.
- Badge backgrounds use 15% opacity of their semantic color — never solid fills (except danger ACK buttons).
- All pulsing/glowing effects are reserved for the War Room alert panel only.

## Typography

Single font family throughout: Segoe UI → Helvetica Neue → Arial → sans-serif. No display fonts, no custom web fonts. This ensures instant rendering with no FOUT, which matters for a 24/7 command center that may reload.

- **Display (28px/700):** War Room KPI values, login page title. Used sparingly — maximum 5 instances per screen.
- **Heading (20px/700):** Page titles only. One per page.
- **Subheading (14px/600):** Card section titles, panel headers.
- **Body (13px/400):** Default text. Event descriptions, table cells, form content.
- **Caption (11px/400):** Secondary information, timestamps, metadata, breadcrumbs.
- **Micro (9px/600/uppercase):** KPI labels, column group headers, status indicators. Always uppercase with letter-spacing.
- **KPI Value (24px/800):** War Room KPI numbers. Always use `tabular-nums` for alignment.

### Rules
- Never use font weights below 400 or above 800.
- All numeric displays (KPIs, stats, tables) use `font-variant-numeric: tabular-nums` for column alignment.
- Truncate long text with ellipsis — never wrap within table cells.

## Layout

### War Room (Command Center View)
The War Room uses a fixed layout optimized for 16:9 large displays:
- **Top strip (48px):** KPI cards in a flex row, clock anchored right.
- **Main body:** CSS Grid `3fr 2fr` — map (left 60%) and panels (right 40%).
- **Bottom strip:** Compact chart cards in flex row.
- No scrolling in the War Room — all content fits within viewport.
- Padding is reduced to 10-12px to maximize information density.

### Standard Pages
- Sidebar: 180px fixed width, collapsible.
- Content area: flex column with 18px padding.
- Grid layouts: use `grid-template-columns` for side-by-side cards.
- Tables: full-width within cards, horizontal scroll on overflow.

### Spacing Scale
- `xs` (4px): Inline gaps, icon padding.
- `sm` (8px): Badge internal padding, compact list items.
- `md` (12px): Card internal gaps, form field spacing.
- `lg` (16px): Card-to-card gaps, section separators.
- `xl` (20px): Card internal padding (default).
- `xxl` (24px): Page-level section spacing.

## Components

### Buttons
- **Primary:** Pill-shaped (`border-radius: 20px`), neutral white fill (`primary`), dark text (`primary-foreground`). One primary button per visible section maximum.
- **Secondary:** Pill-shaped, transparent with border, secondary text color.
- **Danger:** Pill-shaped, danger red fill, white text. Used only for destructive actions and alert ACK buttons.
- **Small variant:** Reduced padding (5px 14px), 11px font. Used in table action columns and inline controls.

### Cards
- Background: surface color. Border: 1px solid border color. Border-radius: 12px. Padding: 20px.
- Cards never have shadows — depth is communicated through background color tiers only.
- Section titles inside cards use the subheading style.

### Badges
- Pill-shaped (border-radius: 20px). 10px font, 600 weight.
- Background: 15% opacity of semantic color. Text: full semantic color.
- Variants: blue (default/info), green (success/active), red (critical/danger), orange (warning/high), yellow (caution/medium), muted (disabled/inactive).

### Tables
- Header row: elevated background, micro typography (10px uppercase).
- Body rows: transparent background, 1px bottom border.
- No zebra striping — rely on borders for row separation.
- Clickable rows: change cursor to pointer, text color to primary (`#FAFAFA`) on interactive cells (ranger names, event IDs).

### Forms/Inputs
- Background: page background color (darkest tier) — creates subtle inset effect within surface cards.
- Border: 1px solid border color. Border-radius: 8px.
- Label: caption style, secondary text color, displayed above input.
- Focus state: ring color (`#D4D4D4`, `--ring: 0 0% 83.1%`).

### Alert Panel (War Room only)
- Background: danger-bg (15% opacity red).
- Border: 1px solid with 25% opacity red.
- Unacknowledged items have pulsing red dot indicator (CSS animation, 800ms interval).
- ACK button: solid danger red, pill-shaped, white text.
- Acknowledged items: dimmed, muted badge replaces ACK button.

### Layer Toggles (Map)
- Floating panel with `backdrop-filter: blur(8px)` over map.
- Background: 85% opacity of background color.
- Checkbox-style toggles: 12px squares with border and neutral white fill when active.

## Semantic Color Usage

| Context | Color Token | Usage |
|---------|-------------|-------|
| Event priority: Critical | danger | Dot indicator, text, badge |
| Event priority: High | warning | Dot indicator, text, badge |
| Event priority: Medium | caution | Dot indicator, text, badge |
| Event priority: Low | success | Dot indicator, text, badge |
| Event state: New | primary (neutral white) | Badge |
| Event state: Active | warning | Badge |
| Event state: Resolved | success | Badge |
| Sync status: Connected | success | Dot + text |
| Sync status: Failed | danger | Dot + text + banner |
| Subject marker: Ranger/Boat | primary (neutral white) | Map dot |
| Subject marker: Wildlife | success | Map dot |
| Subject marker: Event | danger/warning | Map dot |
| Patrol track: Foot | primary (neutral white) | Map polyline |
| Patrol track: Seaborne | info | Map polyline |
| Patrol area polygon | primary (neutral white) | Map polygon fill (6% opacity) + stroke (30% opacity) |
| Fuel consumption rate | info | KPI value, trend chart line |
| Fuel entry receipt | success | Photo indicator badge |
| Accompanying ranger: Registered | primary (neutral white) | Chip background (primary-light), text |
| Accompanying ranger: Free-text | muted (elevated bg) | Chip background, text-primary |
| Performance: Reported | success | Column text, legend dot |
| Performance: Accompanied | warning | Column text, legend dot |
| Performance: Total credit | info | Column text (bold), summary value |
| Currency amount | text-primary | Tabular-nums, locale-formatted |

## Don'ts
- Never use gradients on buttons or cards — solid fills only.
- Never use box-shadows for depth — use background color tiers.
- Never use more than one primary button per visible section.
- Never use colored borders on cards — only `border` color token.
- Never use custom fonts or web fonts — stick to system font stack.
- Never use animations outside the War Room alert panel.
- Never use zebra striping in tables.
- Never put scrollable content in the War Room — it must fit the viewport.
- Never use icons without text labels in navigation — the sidebar always shows text.
- Never use toast notifications — use the Notification Center and War Room alert panel instead.
