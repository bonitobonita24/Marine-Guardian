/**
 * Variance Info — Coverage Report Page 2 footer callout.
 *
 * The v2 PRODUCT.md L771 page 2 spec calls for a "Variance Info inline
 * dialog explaining estimation methodology". PDFs do not support
 * interactive dialogs, so the dialog renders as a static styled box at
 * the bottom of Page 2. Same content, no JavaScript dependency.
 *
 * RSC — no client island.
 */

export function VarianceInfoCallout() {
  return (
    <aside
      data-testid="variance-info-callout"
      style={{
        marginTop: "12px",
        padding: "10px 14px",
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
        borderLeft: "4px solid #0e7490",
        fontSize: "9.5px",
        lineHeight: 1.5,
        color: "#334155",
        borderRadius: "4px",
      }}
    >
      <strong style={{ color: "#0e7490" }}>How patrols are attributed:</strong>{" "}
      Each patrol is assigned to the enabled Area Boundary nearest to its
      recorded start location (within a 5&nbsp;km threshold). When a patrol has
      no track start point, the patrol&apos;s free-text area name is matched
      against boundary names and aliases as a fallback. Patrols that match
      neither strategy are reported under {""}
      <em>&ldquo;Outside enabled boundaries&rdquo;</em> — they are still counted
      on Page 1 but do not contribute to per-boundary tallies. Disabled
      boundaries never receive attributions.
    </aside>
  );
}
