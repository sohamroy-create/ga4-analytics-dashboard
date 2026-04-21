import { GA4QueryParams } from "./ga4";

interface ParsedQuery {
  params: GA4QueryParams;
  summary_template: string;
  chartType: "bar" | "line" | "table" | "metric";
}

function getDateRange(query: string): { start: string; end: string } {
  const lower = query.toLowerCase();
  const today = new Date();

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  if (lower.includes("today")) return { start: "today", end: "today" };
  if (lower.includes("yesterday")) return { start: "yesterday", end: "yesterday" };

  if (lower.includes("last 7 days") || lower.includes("past week") || lower.includes("last week") || lower.includes("this week"))
    return { start: "7daysAgo", end: "today" };

  if (lower.includes("last 14 days") || lower.includes("past 2 weeks") || lower.includes("two weeks"))
    return { start: "14daysAgo", end: "today" };

  if (lower.includes("last 30 days") || lower.includes("past month") || lower.includes("last month") || lower.includes("this month"))
    return { start: "30daysAgo", end: "today" };

  if (lower.includes("last 90 days") || lower.includes("past 3 months") || lower.includes("last quarter") || lower.includes("this quarter"))
    return { start: "90daysAgo", end: "today" };

  if (lower.includes("last 6 months") || lower.includes("past 6 months"))
    return { start: "180daysAgo", end: "today" };

  if (lower.includes("this year") || lower.includes("last year") || lower.includes("ytd"))
    return { start: fmt(new Date(today.getFullYear(), 0, 1)), end: "today" };

  // Match "last N days"
  const daysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (daysMatch) return { start: `${daysMatch[1]}daysAgo`, end: "today" };

  // Match specific month names
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  for (let i = 0; i < months.length; i++) {
    if (lower.includes(months[i])) {
      const year = today.getFullYear();
      const monthStart = new Date(year, i, 1);
      const monthEnd = new Date(year, i + 1, 0);
      if (monthEnd > today) return { start: fmt(monthStart), end: "today" };
      return { start: fmt(monthStart), end: fmt(monthEnd) };
    }
  }

  // Default: last 30 days
  return { start: "30daysAgo", end: "today" };
}

export function parseQuery(query: string): ParsedQuery {
  const lower = query.toLowerCase();
  const dateRange = getDateRange(query);

  // ── TRAFFIC / OVERVIEW ──
  if (lower.match(/traffic|overview|how.*doing|dashboard|summary|performance/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["date"],
        metrics: ["totalUsers", "sessions", "screenPageViews", "bounceRate"],
        orderBy: "date",
        orderDesc: false,
      },
      summary_template: "traffic_overview",
      chartType: "line",
    };
  }

  // ── TOP PAGES ──
  if (lower.match(/top pages?|popular pages?|most visited|best pages?|page views/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["pagePath"],
        metrics: ["screenPageViews", "totalUsers", "bounceRate"],
        orderBy: "screenPageViews",
        orderDesc: true,
        limit: 15,
      },
      summary_template: "top_pages",
      chartType: "bar",
    };
  }

  // ── SOURCES / REFERRALS / CHANNELS ──
  if (lower.match(/source|referr|channel|where.*come|acquisition|medium/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["sessionSourceMedium"],
        metrics: ["sessions", "totalUsers", "bounceRate"],
        orderBy: "sessions",
        orderDesc: true,
        limit: 15,
      },
      summary_template: "sources",
      chartType: "bar",
    };
  }

  // ── COUNTRIES / GEO ──
  if (lower.match(/countr|geo|location|region|city|where.*from/)) {
    const isDimCity = lower.includes("city") || lower.includes("cities");
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: [isDimCity ? "city" : "country"],
        metrics: ["totalUsers", "sessions", "screenPageViews"],
        orderBy: "totalUsers",
        orderDesc: true,
        limit: 20,
      },
      summary_template: "geo",
      chartType: "bar",
    };
  }

  // ── DEVICES ──
  if (lower.match(/device|mobile|desktop|tablet|browser/)) {
    const isBrowser = lower.includes("browser");
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: [isBrowser ? "browser" : "deviceCategory"],
        metrics: ["totalUsers", "sessions", "bounceRate"],
        orderBy: "totalUsers",
        orderDesc: true,
        limit: 10,
      },
      summary_template: "devices",
      chartType: "bar",
    };
  }

  // ── EVENTS / CONVERSIONS / APPLIES ──
  if (lower.match(/event|conversion|appl|job_apply|click|chatbot|interact/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["eventName"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: "eventCount",
        orderDesc: true,
        limit: 20,
      },
      summary_template: "events",
      chartType: "table",
    };
  }

  // ── USERS / ENGAGEMENT ──
  if (lower.match(/users?|engagement|session duration|bounce|retention|active/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["date"],
        metrics: ["totalUsers", "newUsers", "averageSessionDuration", "bounceRate"],
        orderBy: "date",
        orderDesc: false,
      },
      summary_template: "engagement",
      chartType: "line",
    };
  }

  // ── LANDING PAGES ──
  if (lower.match(/landing|entry|first page/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["landingPage"],
        metrics: ["sessions", "totalUsers", "bounceRate"],
        orderBy: "sessions",
        orderDesc: true,
        limit: 15,
      },
      summary_template: "landing_pages",
      chartType: "table",
    };
  }

  // ── SEARCH QUERIES ON SITE ──
  if (lower.match(/search|query|queries|what.*search/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["searchTerm"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: "eventCount",
        orderDesc: true,
        limit: 20,
      },
      summary_template: "search",
      chartType: "table",
    };
  }

  // ── WEEKLY BREAKDOWN ──
  if (lower.match(/week|weekly/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["isoYearIsoWeek"],
        metrics: ["totalUsers", "sessions", "screenPageViews"],
        orderBy: "isoYearIsoWeek",
        orderDesc: false,
      },
      summary_template: "weekly",
      chartType: "bar",
    };
  }

  // ── DEFAULT: traffic overview ──
  return {
    params: {
      startDate: dateRange.start,
      endDate: dateRange.end,
      dimensions: ["date"],
      metrics: ["totalUsers", "sessions", "screenPageViews"],
      orderBy: "date",
      orderDesc: false,
    },
    summary_template: "traffic_overview",
    chartType: "line",
  };
}

export function buildSummary(
  template: string,
  rows: Record<string, string | number>[],
  dateRange: { start: string; end: string }
): string {
  if (!rows || rows.length === 0) {
    return `No data found for the period ${dateRange.start} to ${dateRange.end}. This might mean there was no traffic during this period, or the selected dimension doesn't have data.`;
  }

  const period = `${dateRange.start} to ${dateRange.end}`;

  switch (template) {
    case "traffic_overview": {
      const totalUsers = rows.reduce((s, r) => s + (Number(r.totalUsers) || 0), 0);
      const totalSessions = rows.reduce((s, r) => s + (Number(r.sessions) || 0), 0);
      const totalPageviews = rows.reduce((s, r) => s + (Number(r.screenPageViews) || 0), 0);
      const avgBounce = rows.reduce((s, r) => s + (Number(r.bounceRate) || 0), 0) / rows.length;
      return `Here's your traffic overview for ${period}:\n\n` +
        `Total Users: ${totalUsers.toLocaleString()}\n` +
        `Total Sessions: ${totalSessions.toLocaleString()}\n` +
        `Total Pageviews: ${totalPageviews.toLocaleString()}\n` +
        `Avg Bounce Rate: ${(avgBounce * 100).toFixed(1)}%\n\n` +
        `Daily trend shown below:`;
    }

    case "top_pages": {
      const top3 = rows.slice(0, 3);
      return `Your top pages for ${period}:\n\n` +
        top3.map((r, i) => `${i + 1}. ${r.pagePath} — ${Number(r.screenPageViews).toLocaleString()} views`).join("\n") +
        `\n\nFull breakdown below:`;
    }

    case "sources": {
      const top3 = rows.slice(0, 3);
      return `Your top traffic sources for ${period}:\n\n` +
        top3.map((r, i) => `${i + 1}. ${r.sessionSourceMedium} — ${Number(r.sessions).toLocaleString()} sessions`).join("\n") +
        `\n\nFull breakdown below:`;
    }

    case "geo": {
      const dimKey = rows[0] && "country" in rows[0] ? "country" : "city";
      const top3 = rows.slice(0, 3);
      return `Your top ${dimKey === "country" ? "countries" : "cities"} for ${period}:\n\n` +
        top3.map((r, i) => `${i + 1}. ${r[dimKey]} — ${Number(r.totalUsers).toLocaleString()} users`).join("\n") +
        `\n\nFull breakdown below:`;
    }

    case "devices": {
      const dimKey = rows[0] && "browser" in rows[0] ? "browser" : "deviceCategory";
      return `Device breakdown for ${period}:\n\n` +
        rows.slice(0, 5).map((r) => `${r[dimKey]}: ${Number(r.totalUsers).toLocaleString()} users`).join("\n") +
        `\n\nFull breakdown below:`;
    }

    case "events": {
      const topEvents = rows.slice(0, 5);
      return `Top events for ${period}:\n\n` +
        topEvents.map((r, i) => `${i + 1}. ${r.eventName} — ${Number(r.eventCount).toLocaleString()} times`).join("\n") +
        `\n\nFull list below:`;
    }

    case "engagement": {
      const totalUsers = rows.reduce((s, r) => s + (Number(r.totalUsers) || 0), 0);
      const totalNew = rows.reduce((s, r) => s + (Number(r.newUsers) || 0), 0);
      const avgDuration = rows.reduce((s, r) => s + (Number(r.averageSessionDuration) || 0), 0) / rows.length;
      const avgBounce = rows.reduce((s, r) => s + (Number(r.bounceRate) || 0), 0) / rows.length;
      return `User engagement for ${period}:\n\n` +
        `Total Users: ${totalUsers.toLocaleString()}\n` +
        `New Users: ${totalNew.toLocaleString()}\n` +
        `Returning Users: ${(totalUsers - totalNew).toLocaleString()}\n` +
        `Avg Session Duration: ${avgDuration.toFixed(0)}s\n` +
        `Avg Bounce Rate: ${(avgBounce * 100).toFixed(1)}%\n\n` +
        `Daily trend shown below:`;
    }

    case "weekly": {
      return `Weekly breakdown for ${period}:\n\n` +
        rows.map((r) => `Week ${r.isoYearIsoWeek}: ${Number(r.totalUsers).toLocaleString()} users, ${Number(r.sessions).toLocaleString()} sessions`).join("\n");
    }

    default:
      return `Results for ${period} (${rows.length} rows):`;
  }
}
