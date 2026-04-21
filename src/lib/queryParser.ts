import { GA4QueryParams } from "./ga4";

export interface ParsedQuery {
  params: GA4QueryParams;
  summary_template: string;
  chartType: "bar" | "line" | "table" | "metric";
  /** If set, run a comparison report for the previous period too */
  comparison?: boolean;
  /** If set, also run a geographic breakdown */
  geoBreakdown?: boolean;
}

export interface ClarificationQuestion {
  id: string;
  text: string;
  options: { label: string; value: string }[];
}

export interface ClarificationResult {
  type: "clarification";
  message: string;
  questions: ClarificationQuestion[];
}

// ─── Date range helpers ───

function hasExplicitTimeline(query: string): boolean {
  const lower = query.toLowerCase();
  const timePatterns = [
    /today/, /yesterday/, /last\s+\d+\s+days?/, /past\s+\d+/, /this\s+(week|month|quarter|year)/,
    /last\s+(week|month|quarter|year|7|14|30|90)/, /past\s+(week|month|quarter|year)/,
    /\d{4}-\d{2}-\d{2}/, /january|february|march|april|may|june|july|august|september|october|november|december/,
    /ytd/, /two weeks/, /6 months/,
  ];
  return timePatterns.some((p) => p.test(lower));
}

function hasExplicitGeo(query: string): boolean {
  const lower = query.toLowerCase();
  return /countr|geo|region|city|cities|india|us|usa|uk|global|worldwide|by\s*(location|geography|region)|broken?\s*down.*geo/i.test(lower);
}

function hasExplicitScope(query: string): boolean {
  const lower = query.toLowerCase();
  return /top pages?|sources?|devices?|events?|landing|browser|mobile|desktop|channels?|referr/.test(lower);
}

function detectIntent(query: string): string {
  const lower = query.toLowerCase();
  if (lower.match(/engag|bounce|session duration|retention|drop|increas|decreas|improv|worsen|chang/)) return "engagement";
  if (lower.match(/traffic|visit|overview|how.*doing|dashboard|summary|performance/)) return "traffic";
  if (lower.match(/top pages?|popular pages?|most visited|best pages?|page views/)) return "top_pages";
  if (lower.match(/source|referr|channel|where.*come|acquisition|medium/)) return "sources";
  if (lower.match(/countr|geo|location|region|city|where.*from/)) return "geo";
  if (lower.match(/device|mobile|desktop|tablet|browser/)) return "devices";
  if (lower.match(/event|conversion|appl|job_apply|click|chatbot|interact/)) return "events";
  if (lower.match(/users?|active/)) return "users";
  if (lower.match(/landing|entry|first page/)) return "landing";
  if (lower.match(/search|query|queries|what.*search/)) return "search";
  if (lower.match(/week|weekly/)) return "weekly";
  return "unknown";
}

export function checkClarification(query: string): ClarificationResult | null {
  const lower = query.toLowerCase();
  const intent = detectIntent(query);
  const hasTimeline = hasExplicitTimeline(query);
  const hasGeo = hasExplicitGeo(query);
  const hasScope = hasExplicitScope(query);

  const questions: ClarificationQuestion[] = [];

  // If the intent is unclear or very generic
  if (intent === "unknown" && !hasScope) {
    questions.push({
      id: "scope",
      text: "What aspect of your analytics are you interested in?",
      options: [
        { label: "Traffic Overview", value: "traffic overview" },
        { label: "Engagement & Bounce Rate", value: "engagement metrics" },
        { label: "Top Pages", value: "top pages" },
        { label: "Traffic Sources", value: "traffic sources" },
        { label: "Geographic Breakdown", value: "geographic breakdown" },
        { label: "Events & Conversions", value: "events and conversions" },
      ],
    });
  }

  // If no timeline specified on an open-ended question
  if (!hasTimeline) {
    questions.push({
      id: "timeline",
      text: "What time period should I look at?",
      options: [
        { label: "Last 7 days", value: "last 7 days" },
        { label: "Last 14 days", value: "last 14 days" },
        { label: "Last 30 days", value: "last 30 days" },
        { label: "Last 90 days", value: "last 90 days" },
        { label: "This year (YTD)", value: "this year" },
      ],
    });
  }

  // For engagement/comparison queries, ask about geo if not specified
  if ((intent === "engagement" || intent === "traffic" || intent === "unknown") && !hasGeo && !hasScope) {
    questions.push({
      id: "geo",
      text: "Should I break this down by geography?",
      options: [
        { label: "Global (all regions)", value: "globally" },
        { label: "By country", value: "broken down by country" },
        { label: "By city", value: "broken down by city" },
      ],
    });
  }

  // For engagement with comparison keywords
  if (intent === "engagement" && lower.match(/drop|increas|decreas|improv|worsen|chang|compar/)) {
    if (!questions.find((q) => q.id === "timeline")) {
      questions.push({
        id: "compare",
        text: "Want me to compare against a previous period?",
        options: [
          { label: "Yes, compare week-over-week", value: "compare this week vs last week" },
          { label: "Yes, compare month-over-month", value: "compare this month vs last month" },
          { label: "No, just show the trend", value: "show the trend" },
        ],
      });
    }
  }

  if (questions.length === 0) return null;

  const intentLabel = intent !== "unknown" ? intent.replace("_", " ") : "analytics";
  return {
    type: "clarification",
    message: `I'd like to give you the most useful ${intentLabel} data. Let me ask a few quick questions:`,
    questions,
  };
}

// ─── Date parsing ───

export function getDateRange(query: string): { start: string; end: string } {
  const lower = query.toLowerCase();
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

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

  const daysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (daysMatch) return { start: `${daysMatch[1]}daysAgo`, end: "today" };

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

  return { start: "30daysAgo", end: "today" };
}

// ─── Query parser ───

export function parseQuery(query: string): ParsedQuery {
  const lower = query.toLowerCase();
  const dateRange = getDateRange(query);

  const wantsComparison = !!lower.match(/compar|vs|versus|drop|increas|decreas|chang|improv|worsen/);
  const wantsGeoBreakdown = !!lower.match(/by\s*(country|countries|city|cities|geo|region|geography)|broken?\s*down.*geo|globally/);

  // ── ENGAGEMENT (explicit engagement queries) ──
  if (lower.match(/engag|bounce\s*rate|session\s*duration|retention|drop.*engag|engag.*drop/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: wantsGeoBreakdown ? ["country"] : ["date"],
        metrics: ["engagementRate", "bounceRate", "averageSessionDuration", "sessionsPerUser", "totalUsers"],
        orderBy: wantsGeoBreakdown ? "totalUsers" : "date",
        orderDesc: wantsGeoBreakdown,
        limit: wantsGeoBreakdown ? 20 : undefined,
      },
      summary_template: "engagement_rate",
      chartType: wantsGeoBreakdown ? "table" : "line",
      comparison: wantsComparison,
      geoBreakdown: wantsGeoBreakdown && !lower.match(/by\s*(country|countries|city|cities|geo|region)/),
    };
  }

  // ── TRAFFIC / OVERVIEW ──
  if (lower.match(/traffic|overview|how.*doing|dashboard|summary|performance/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: wantsGeoBreakdown ? ["country"] : ["date"],
        metrics: ["totalUsers", "sessions", "screenPageViews", "bounceRate"],
        orderBy: wantsGeoBreakdown ? "totalUsers" : "date",
        orderDesc: wantsGeoBreakdown,
        limit: wantsGeoBreakdown ? 20 : undefined,
      },
      summary_template: "traffic_overview",
      chartType: wantsGeoBreakdown ? "bar" : "line",
      comparison: wantsComparison,
      geoBreakdown: wantsGeoBreakdown && !lower.match(/by\s*(country|countries|city|cities|geo|region)/),
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

  // ── USERS / ACTIVE ──
  if (lower.match(/users?|active/)) {
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

// ─── Summary builder ───

export function buildSummary(
  template: string,
  rows: Record<string, string | number>[],
  dateRange: { start: string; end: string },
  comparisonRows?: Record<string, string | number>[],
  comparisonDateRange?: { start: string; end: string }
): string {
  if (!rows || rows.length === 0) {
    return `No data found for the period ${dateRange.start} to ${dateRange.end}. This might mean there was no traffic during this period, or the selected dimension doesn't have data.`;
  }

  const period = `${dateRange.start} to ${dateRange.end}`;

  switch (template) {
    case "engagement_rate": {
      // Check if it's a geo breakdown
      if (rows[0] && "country" in rows[0]) {
        return `Engagement by country for ${period}:\n\n` +
          rows.slice(0, 5).map((r, i) => {
            const engRate = (Number(r.engagementRate) * 100).toFixed(1);
            const bounceRate = (Number(r.bounceRate) * 100).toFixed(1);
            return `${i + 1}. ${r.country} — ${engRate}% engagement, ${bounceRate}% bounce, ${Number(r.totalUsers).toLocaleString()} users`;
          }).join("\n") +
          `\n\nFull breakdown below:`;
      }

      const avgEngagement = rows.reduce((s, r) => s + (Number(r.engagementRate) || 0), 0) / rows.length;
      const avgBounce = rows.reduce((s, r) => s + (Number(r.bounceRate) || 0), 0) / rows.length;
      const avgDuration = rows.reduce((s, r) => s + (Number(r.averageSessionDuration) || 0), 0) / rows.length;
      const avgSessionsPerUser = rows.reduce((s, r) => s + (Number(r.sessionsPerUser) || 0), 0) / rows.length;

      let summary = `Engagement metrics for ${period}:\n\n` +
        `Avg Engagement Rate: ${(avgEngagement * 100).toFixed(1)}%\n` +
        `Avg Bounce Rate: ${(avgBounce * 100).toFixed(1)}%\n` +
        `Avg Session Duration: ${avgDuration.toFixed(0)}s\n` +
        `Sessions per User: ${avgSessionsPerUser.toFixed(2)}\n`;

      if (comparisonRows && comparisonRows.length > 0 && comparisonDateRange) {
        const prevEngagement = comparisonRows.reduce((s, r) => s + (Number(r.engagementRate) || 0), 0) / comparisonRows.length;
        const prevBounce = comparisonRows.reduce((s, r) => s + (Number(r.bounceRate) || 0), 0) / comparisonRows.length;
        const prevDuration = comparisonRows.reduce((s, r) => s + (Number(r.averageSessionDuration) || 0), 0) / comparisonRows.length;

        const engDiff = ((avgEngagement - prevEngagement) * 100).toFixed(1);
        const bounceDiff = ((avgBounce - prevBounce) * 100).toFixed(1);
        const durDiff = (avgDuration - prevDuration).toFixed(0);

        summary += `\nComparison vs ${comparisonDateRange.start} to ${comparisonDateRange.end}:\n` +
          `Engagement Rate: ${Number(engDiff) >= 0 ? "+" : ""}${engDiff}pp\n` +
          `Bounce Rate: ${Number(bounceDiff) >= 0 ? "+" : ""}${bounceDiff}pp\n` +
          `Session Duration: ${Number(durDiff) >= 0 ? "+" : ""}${durDiff}s\n`;

        if (Number(engDiff) < -2) summary += `\n⚠️ Engagement rate has dropped noticeably.`;
        else if (Number(engDiff) > 2) summary += `\n✅ Engagement rate is trending up.`;
        else summary += `\n→ Engagement rate is relatively stable.`;
      }

      summary += `\n\nDaily trend shown below:`;
      return summary;
    }

    case "traffic_overview": {
      const totalUsers = rows.reduce((s, r) => s + (Number(r.totalUsers) || 0), 0);
      const totalSessions = rows.reduce((s, r) => s + (Number(r.sessions) || 0), 0);
      const totalPageviews = rows.reduce((s, r) => s + (Number(r.screenPageViews) || 0), 0);
      const avgBounce = rows.reduce((s, r) => s + (Number(r.bounceRate) || 0), 0) / rows.length;

      let summary = `Here's your traffic overview for ${period}:\n\n` +
        `Total Users: ${totalUsers.toLocaleString()}\n` +
        `Total Sessions: ${totalSessions.toLocaleString()}\n` +
        `Total Pageviews: ${totalPageviews.toLocaleString()}\n` +
        `Avg Bounce Rate: ${(avgBounce * 100).toFixed(1)}%\n`;

      if (comparisonRows && comparisonRows.length > 0 && comparisonDateRange) {
        const prevUsers = comparisonRows.reduce((s, r) => s + (Number(r.totalUsers) || 0), 0);
        const prevSessions = comparisonRows.reduce((s, r) => s + (Number(r.sessions) || 0), 0);
        const userChange = prevUsers > 0 ? (((totalUsers - prevUsers) / prevUsers) * 100).toFixed(1) : "N/A";
        const sessionChange = prevSessions > 0 ? (((totalSessions - prevSessions) / prevSessions) * 100).toFixed(1) : "N/A";

        summary += `\nComparison vs ${comparisonDateRange.start} to ${comparisonDateRange.end}:\n` +
          `Users: ${userChange}% change\n` +
          `Sessions: ${sessionChange}% change\n`;
      }

      summary += `\nDaily trend shown below:`;
      return summary;
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
