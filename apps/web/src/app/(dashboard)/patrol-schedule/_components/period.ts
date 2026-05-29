export type PeriodView = "biweekly" | "monthly";

export type Period = {
  view: PeriodView;
  /** Inclusive UTC start of window */
  from: Date;
  /** Exclusive UTC end of window */
  to: Date;
};

/**
 * Build a Period centered on `anchor`.
 * - biweekly: 14-day window starting at UTC midnight of anchor's date.
 * - monthly: calendar month containing anchor (UTC).
 */
export function buildPeriod(anchor: Date, view: PeriodView): Period {
  if (view === "biweekly") {
    const from = new Date(
      Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth(),
        anchor.getUTCDate(),
      ),
    );
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    return { view, from, to };
  }

  // monthly
  const from = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1),
  );
  const to = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1),
  );
  return { view, from, to };
}

/**
 * Step forward (+1) or back (-1) by one window.
 * - biweekly: steps by 14 days.
 * - monthly: steps by 1 calendar month.
 */
export function stepPeriod(period: Period, direction: 1 | -1): Period {
  const { view, from } = period;

  if (view === "biweekly") {
    const newAnchor = new Date(
      from.getTime() + direction * 14 * 24 * 60 * 60 * 1000,
    );
    return buildPeriod(newAnchor, view);
  }

  // monthly
  const newAnchor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + direction,
      1,
    ),
  );
  return buildPeriod(newAnchor, view);
}

/**
 * Human-readable label for display.
 * - biweekly: "Mar 3 – Mar 16, 2026" (end date is to - 1 day, inclusive)
 * - monthly: "March 2026"
 */
export function formatPeriodLabel(period: Period): string {
  if (period.view === "monthly") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(period.from);
  }

  // biweekly — inclusive end = to - 1 day
  const inclusiveEnd = new Date(period.to.getTime() - 24 * 60 * 60 * 1000);

  const shortMonth = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });
  const yearFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });

  const fromMonth = shortMonth.format(period.from);
  const fromDay = dayFmt.format(period.from);
  const toMonth = shortMonth.format(inclusiveEnd);
  const toDay = dayFmt.format(inclusiveEnd);
  const year = yearFmt.format(inclusiveEnd);

  return `${fromMonth} ${fromDay} – ${toMonth} ${toDay}, ${year}`;
}
