import { GA4QueryParams, GA4MetadataItem, FunnelStep } from "./ga4";

export interface ParsedQuery {
  params: GA4QueryParams;
  summary_template: string;
  chartType: "bar" | "line" | "table" | "metric" | "funnel";
  comparison?: boolean;
  geoBreakdown?: boolean;
  reportType?: "standard" | "funnel" | "path";
  funnelSteps?: FunnelStep[];
  pathEvent?: string;
  pathPage?: string;
}

type GA4Meta = { dimensions: GA4MetadataItem[]; metrics: GA4MetadataItem[] } | null;

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

// ─── Known GA4 events in this property ───
const TOP_JOB_APPLY_COMPANIES = [
  "LHH_US", "Wells_Fargo", "KB_Transportation", "Maxion_Research",
  "Basements_Plus", "Apex_Focus_Group_LLC", "Yacht", "Christus_Health",
  "Amrize", "Ashley_Furniture_Industries_LL", "Naeve_Inc", "Outlier_AI",
  "RLDG", "Company_Confidential", "DoorDash", "Honeywell_AEROSPACE",
];

const KNOWN_EVENTS = [
  "page_view", "job_apply", "job_apply_", "session_start", "first_visit",
  "user_engagement", "scroll", "view_search_results", "click",
  "job_apply_unknown", "form_start", "chatbot_interaction",
  "k&b_submissions", "sign_in_click", "blog_scroll_60",
];

function detectIntent(query: string): string {
  const lower = query.toLowerCase();
  // Job apply specific (before generic events)
  if (lower.match(/job.?appl|apply|applies|application/)) return "job_apply";
  if (lower.match(/engag|bounce|session duration|retention|drop|increas|decreas|improv|worsen|chang/)) return "engagement";
  if (lower.match(/traffic|visit|overview|how.*doing|dashboard|summary|performance/)) return "traffic";
  if (lower.match(/top pages?|popular pages?|most visited|best pages?|page views/)) return "top_pages";
  if (lower.match(/source|referr|channel|where.*come|acquisition|medium/)) return "sources";
  if (lower.match(/countr|geo|location|region|city|where.*from/)) return "geo";
  if (lower.match(/device|mobile|desktop|tablet|browser/)) return "devices";
  if (lower.match(/event|conversion|click|chatbot|interact/)) return "events";
  if (lower.match(/users?|active/)) return "users";
  if (lower.match(/landing|entry|first page/)) return "landing";
  if (lower.match(/search|query|queries|what.*search/)) return "search";
  if (lower.match(/week|weekly/)) return "weekly";
  return "unknown";
}

function detectCompanyInQuery(query: string): string | null {
  const lower = query.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const companyMap: Record<string, string> = {
    "lhh": "LHH_US", "wells fargo": "Wells_Fargo", "kb transportation": "KB_Transportation",
    "maxion": "Maxion_Research", "basements plus": "Basements_Plus",
    "apex": "Apex_Focus_Group_LLC", "yacht": "Yacht", "christus": "Christus_Health",
    "amrize": "Amrize", "ashley": "Ashley_Furniture_Industries_LL",
    "doordash": "DoorDash", "honeywell": "Honeywell_AEROSPACE",
    "grubhub": "Grubhub", "verizon": "Verizon", "outlier": "Outlier_AI",
    "spectrum": "SPECTRUM", "pnc": "PNC_Financial_Services_Group",
    "optum": "Optum", "globe life": "Globe_Life",
  };
  for (const [keyword, eventSuffix] of Object.entries(companyMap)) {
    if (lower.includes(keyword)) return eventSuffix;
  }
  return null;
}

export function checkClarification(query: string): ClarificationResult | null {
  const lower = query.toLowerCase();
  const intent = detectIntent(query);
  const hasTimeline = hasExplicitTimeline(query);
  const hasScope = hasExplicitScope(query);
  const hasGeo = hasExplicitGeo(query);
  const detectedCompany = detectCompanyInQuery(query);

  const questions: ClarificationQuestion[] = [];

  // 1. Completely vague query (no intent, no scope, no timeline)
  if (intent === "unknown" && !hasScope && !hasTimeline) {
    questions.push({
      id: "scope",
      text: "What aspect of your analytics are you interested in?",
      options: [
        { label: "Traffic Overview", value: "traffic overview for last 30 days" },
        { label: "Engagement & Bounce Rate", value: "engagement metrics for last 30 days" },
        { label: "Job Apply Metrics", value: "job apply rate for last 30 days" },
        { label: "Top Pages", value: "top pages for last 30 days" },
        { label: "Traffic Sources", value: "traffic sources for last 30 days" },
        { label: "Geographic Breakdown", value: "geographic breakdown for last 30 days" },
        { label: "Events & Conversions", value: "events and conversions for last 30 days" },
      ],
    });
    return {
      type: "clarification",
      message: "I'd like to help! What aspect of your analytics are you interested in?",
      questions,
    };
  }

  // 2. Job apply specific: ask WHICH job apply they mean
  if (intent === "job_apply" && !detectedCompany && !lower.match(/by\s*company|broken?\s*down.*company|per\s*company|each\s*company|all.*combined|all.*job/)) {
    questions.push({
      id: "job_apply_type",
      text: "Which job apply data do you want to see? We track applies across multiple companies.",
      options: [
        { label: "All job applies (combined)", value: "all job_apply events combined" },
        { label: "Breakdown by company", value: "job_apply broken down by company" },
        { label: "LHH US", value: "job_apply for LHH_US" },
        { label: "Wells Fargo", value: "job_apply for Wells_Fargo" },
        { label: "KB Transportation", value: "job_apply for KB_Transportation" },
        { label: "Maxion Research", value: "job_apply for Maxion_Research" },
        { label: "Unknown company applies", value: "job_apply_unknown events" },
      ],
    });

    // Also ask timeline if missing
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

    return {
      type: "clarification",
      message: "We track job applies across multiple companies. Let me narrow this down:",
      questions,
    };
  }

  // 3. "Traffic" or "engagement" with geo dimension but no specific metrics requested
  //    e.g., "breakdown traffic based on geographies" — ask WHICH metric
  if ((intent === "traffic" || intent === "engagement") && hasGeo && !lower.match(/users?|sessions?|page\s*views?|bounce|engagement\s*rate|duration|conversion/)) {
    const metricOptions = intent === "traffic"
      ? [
          { label: "Users & Sessions", value: "users and sessions" },
          { label: "Page Views", value: "page views" },
          { label: "Bounce Rate", value: "bounce rate" },
          { label: "All traffic metrics", value: "users, sessions, page views, and bounce rate" },
        ]
      : [
          { label: "Engagement Rate", value: "engagement rate" },
          { label: "Bounce Rate", value: "bounce rate" },
          { label: "Session Duration", value: "session duration" },
          { label: "All engagement metrics", value: "engagement rate, bounce rate, and session duration" },
        ];
    questions.push({
      id: "metrics",
      text: `Which ${intent} metrics do you want broken down by geography?`,
      options: metricOptions,
    });

    if (!hasTimeline) {
      questions.push({
        id: "timeline",
        text: "What time period?",
        options: [
          { label: "Last 7 days", value: "last 7 days" },
          { label: "Last 30 days", value: "last 30 days" },
          { label: "Last 90 days", value: "last 90 days" },
        ],
      });
    }

    return {
      type: "clarification",
      message: `I can break down ${intent} by geography. Let me clarify what you need:`,
      questions,
    };
  }

  // 4. Clear intent but no timeline — still ask for timeline on broad queries
  //    (only for intents where timeline matters and query doesn't have one)
  if (!hasTimeline && (intent === "unknown" || (intent === "traffic" && !hasScope) || (intent === "engagement" && !hasScope))) {
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
    return {
      type: "clarification",
      message: "What time period should I look at?",
      questions,
    };
  }

  return null;
}

// ─── Conversation continuity ───

interface ConversationContext {
  lastQuery: string;
  lastIntent: string;
  lastMetrics: string[];
  lastDimensions: string[];
  lastDateRange: { start: string; end: string };
  lastFilters?: Record<string, unknown>;
}

/** Detect if a query is a follow-up that references previous context */
export function isFollowUp(query: string): boolean {
  const lower = query.toLowerCase();
  // References to previous data: "that", "those", "it", "this", "the same", "break down", "break it down"
  const followUpPatterns = [
    /\b(that|those|this|it|the same|these results?|the data|the above|previous)\b/,
    /\bbreak\s*(it|that|this|them)?\s*down\b/,
    /\bnow\s+(show|give|break|filter|sort|compare|add)\b/,
    /\bcan\s+you\s+(also|break|show|filter|add|compare|give)\b/,
    /\binstead\b/,
    /\bwhat\s+about\b/,
    /\bhow\s+about\b/,
    /\bsame\s+(but|for|with|data|query|thing)\b/,
    /\balso\s+(show|include|add|break)\b/,
  ];
  return followUpPatterns.some((p) => p.test(lower));
}

/** Merge a follow-up query with previous context to build a complete query */
export function mergeWithContext(query: string, ctx: ConversationContext): string {
  const lower = query.toLowerCase();

  // Detect what modification the user wants
  const wantsGeo = /geo|countr|region|city|location|geography|geograph/i.test(lower);
  const wantsCompare = /compar|vs|versus|week.over|month.over/i.test(lower);
  const wantsDevices = /device|mobile|desktop|browser/i.test(lower);
  const wantsSources = /source|referr|channel|medium/i.test(lower);
  const wantsTimeline = hasExplicitTimeline(query);

  // Build a merged query from context + new modifier
  const parts: string[] = [];

  // Carry over the base intent from context
  const intentMap: Record<string, string> = {
    "job_apply_trend": "job apply",
    "job_apply_breakdown": "job apply by company",
    "job_apply_company": "job apply",
    "traffic_overview": "traffic",
    "engagement_rate": "engagement",
    "top_pages": "top pages",
    "sources": "traffic sources",
    "geo": "geographic data",
    "devices": "device data",
    "events": "events",
    "engagement": "user engagement",
    "funnel": "funnel",
    "path": "path analysis",
    "chatbot": "chatbot interactions",
    "form_events": "form submissions",
    "sign_in": "sign-in clicks",
  };

  parts.push(intentMap[ctx.lastIntent] || ctx.lastIntent);

  // Add the new dimension/modification
  if (wantsGeo) parts.push("broken down by country");
  if (wantsCompare) parts.push("compare with previous period");
  if (wantsDevices) parts.push("by device");
  if (wantsSources) parts.push("by source");

  // Carry timeline from context or new query
  if (wantsTimeline) {
    // Use the new timeline from the follow-up query
    parts.push(query.replace(/\b(break|it|that|those|this|them|down|can you|also|now|show|give)\b/gi, "").trim());
  } else {
    // Use the timeline from previous context
    parts.push(`from ${ctx.lastDateRange.start} to ${ctx.lastDateRange.end}`);
  }

  // Carry over filters (like specific event names)
  if (ctx.lastFilters) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter = ctx.lastFilters as any;
      const fieldName = filter?.filter?.fieldName;
      const eventValue = filter?.filter?.stringFilter?.value;
      if (fieldName === "eventName" && typeof eventValue === "string") {
        if (eventValue.startsWith("job_apply")) {
          parts.push(`for ${eventValue} event`);
        }
      }
    } catch { /* ignore filter parsing errors */ }
  }

  const merged = parts.join(", ");
  console.log(`[Context merge] "${query}" + context → "${merged}"`);
  return merged;
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

// ─── Dimension/Metric fuzzy matching against GA4 metadata ───

const DIMENSION_ALIASES: Record<string, string> = {
  "page": "pagePath", "pages": "pagePath", "url": "pagePath", "urls": "pagePath",
  "landing page": "landingPagePlusQueryString", "entry page": "landingPagePlusQueryString",
  "source": "sessionSource", "medium": "sessionMedium", "source/medium": "sessionSourceMedium",
  "campaign": "sessionCampaignName", "channel": "sessionDefaultChannelGroup",
  "country": "country", "countries": "country", "region": "region", "city": "city",
  "device": "deviceCategory", "browser": "browser", "os": "operatingSystem",
  "screen resolution": "screenResolution", "language": "language",
  "age": "userAgeBracket", "gender": "userGender",
  "new vs returning": "newVsReturning", "user type": "newVsReturning",
  "event": "eventName", "event name": "eventName",
  "page title": "pageTitle", "hostname": "hostName",
  "continent": "continent", "sub continent": "subContinent",
  "date": "date", "week": "isoYearIsoWeek", "month": "month", "year": "year",
  "hour": "hour", "day of week": "dayOfWeek",
  "first user source": "firstUserSource", "first user medium": "firstUserMedium",
  "first user campaign": "firstUserCampaignName",
  "session source platform": "sessionSourcePlatform",
  "content group": "contentGroup", "content type": "contentType",
  "page referrer": "pageReferrer",
};

const METRIC_ALIASES: Record<string, string> = {
  "users": "totalUsers", "total users": "totalUsers", "visitors": "totalUsers",
  "new users": "newUsers", "new visitors": "newUsers",
  "active users": "activeUsers", "active": "active1DayUsers",
  "sessions": "sessions", "visits": "sessions",
  "page views": "screenPageViews", "pageviews": "screenPageViews", "views": "screenPageViews",
  "bounce rate": "bounceRate", "bounces": "bounceRate",
  "engagement rate": "engagementRate", "engagement": "engagementRate",
  "session duration": "averageSessionDuration", "avg duration": "averageSessionDuration",
  "sessions per user": "sessionsPerUser",
  "engaged sessions": "engagedSessions", "engaged sessions per user": "engagedSessionsPerUser",
  "event count": "eventCount", "events": "eventCount",
  "conversions": "conversions", "conversion rate": "sessionConversionRate",
  "revenue": "totalRevenue", "purchase revenue": "purchaseRevenue",
  "transactions": "transactions", "ecommerce purchases": "ecommercePurchases",
  "add to cart": "addToCarts", "checkouts": "checkouts",
  "items viewed": "itemsViewed", "item revenue": "itemRevenue",
  "user engagement duration": "userEngagementDuration",
  "screen page views per session": "screenPageViewsPerSession",
  "crash free users rate": "crashFreeUsersRate",
  "wau": "wauPerMau", "dau": "dauPerMau",
  "scroll": "eventCount", "scrolls": "eventCount",
};

function resolveMetric(term: string, metadata: GA4Meta): string | null {
  const lower = term.toLowerCase().trim();
  if (METRIC_ALIASES[lower]) return METRIC_ALIASES[lower];
  if (metadata) {
    const exact = metadata.metrics.find((m) => m.apiName.toLowerCase() === lower || m.uiName.toLowerCase() === lower);
    if (exact) return exact.apiName;
    const partial = metadata.metrics.find((m) => m.uiName.toLowerCase().includes(lower) || m.apiName.toLowerCase().includes(lower));
    if (partial) return partial.apiName;
  }
  return null;
}

function resolveDimension(term: string, metadata: GA4Meta): string | null {
  const lower = term.toLowerCase().trim();
  if (DIMENSION_ALIASES[lower]) return DIMENSION_ALIASES[lower];
  if (metadata) {
    const exact = metadata.dimensions.find((d) => d.apiName.toLowerCase() === lower || d.uiName.toLowerCase() === lower);
    if (exact) return exact.apiName;
    const partial = metadata.dimensions.find((d) => d.uiName.toLowerCase().includes(lower) || d.apiName.toLowerCase().includes(lower));
    if (partial) return partial.apiName;
  }
  return null;
}

// ─── Funnel detection ───

const KNOWN_FUNNEL_EVENTS: Record<string, string> = {
  "visit": "session_start", "session": "session_start", "land": "session_start",
  "page view": "page_view", "view": "page_view", "pageview": "page_view",
  "search": "view_search_results", "view search": "view_search_results",
  "scroll": "scroll", "form": "form_start", "form start": "form_start",
  "apply": "job_apply", "job apply": "job_apply", "application": "job_apply",
  "click": "click", "chatbot": "chatbot_interaction", "sign in": "sign_in_click",
  "sign up": "sign_in_click", "login": "sign_in_click",
};

function parseFunnelSteps(query: string): FunnelStep[] | null {
  const lower = query.toLowerCase();
  // Pattern: "from X to Y to Z" or "X → Y → Z" or "X then Y then Z" or "X > Y > Z"
  const separators = /\s*(?:→|->|>|then|to)\s*/;
  const funnelMatch = lower.match(/(?:funnel|path|flow|journey|conversion)\s*(?:from\s+|:\s*)?(.+)/);
  if (!funnelMatch) return null;

  const stepsStr = funnelMatch[1];
  const stepNames = stepsStr.split(separators).map((s) => s.trim()).filter(Boolean);
  if (stepNames.length < 2) return null;

  const steps: FunnelStep[] = [];
  for (const name of stepNames) {
    const eventName = KNOWN_FUNNEL_EVENTS[name] || Object.entries(KNOWN_FUNNEL_EVENTS).find(([k]) => name.includes(k))?.[1];
    if (eventName) {
      steps.push({ name: name.charAt(0).toUpperCase() + name.slice(1), eventName });
    } else if (name.startsWith("/")) {
      // It's a page path
      steps.push({ name, eventName: "page_view" });
    } else {
      // Assume it's an event name directly
      steps.push({ name, eventName: name.replace(/\s+/g, "_") });
    }
  }
  return steps.length >= 2 ? steps : null;
}

// ─── Main parser ───

export function parseQuery(query: string, metadata?: GA4Meta): ParsedQuery {
  const lower = query.toLowerCase();
  const dateRange = getDateRange(query);

  const wantsComparison = !!lower.match(/compar|vs|versus|drop|increas|decreas|chang|improv|worsen/);
  const wantsGeoBreakdown = !!lower.match(/by\s*(country|countries|city|cities|geo|region|geography)|broken?\s*down.*geo|globally/);

  // ── FUNNEL EXPLORATION ──
  if (lower.match(/funnel|conversion\s*funnel|conversion\s*path|user\s*journey|user\s*flow/)) {
    const steps = parseFunnelSteps(query);
    if (steps) {
      return {
        params: { startDate: dateRange.start, endDate: dateRange.end, dimensions: [], metrics: [] },
        summary_template: "funnel", chartType: "funnel",
        reportType: "funnel", funnelSteps: steps,
      };
    }
    // Default funnel: visit → page_view → search → apply
    return {
      params: { startDate: dateRange.start, endDate: dateRange.end, dimensions: [], metrics: [] },
      summary_template: "funnel", chartType: "funnel", reportType: "funnel",
      funnelSteps: [
        { name: "Session Start", eventName: "session_start" },
        { name: "Page View", eventName: "page_view" },
        { name: "Search", eventName: "view_search_results" },
        { name: "Job Apply", eventName: "job_apply" },
      ],
    };
  }

  // ── PATH / FLOW EXPLORATION ──
  if (lower.match(/path\s*(explor|analys)|user\s*path|page\s*flow|what\s*pages?\s*(before|after|lead)|where\s*do\s*(users?|people|visitors?)\s*go/)) {
    const eventMatch = lower.match(/(?:before|after|around|for)\s+(\w+(?:\s+\w+)?)/);
    let pathEvent: string | undefined;
    let pathPage: string | undefined;
    if (eventMatch) {
      const term = eventMatch[1].trim();
      pathEvent = KNOWN_FUNNEL_EVENTS[term] || term.replace(/\s+/g, "_");
    }
    const pageMatch = query.match(/(\/[\w\-\/]+)/);
    if (pageMatch) pathPage = pageMatch[1];

    return {
      params: { startDate: dateRange.start, endDate: dateRange.end, dimensions: ["pagePath", "eventName"], metrics: ["eventCount", "totalUsers"] },
      summary_template: "path", chartType: "table", reportType: "path",
      pathEvent: pathEvent || "job_apply", pathPage,
    };
  }

  // ── DYNAMIC DIMENSION/METRIC DETECTION ──
  // Check if user is asking "show me X by Y" pattern
  const byPattern = lower.match(/(?:show|get|display|give|what(?:'s| is| are)?)\s+(.+?)\s+(?:by|per|grouped?\s*by|broken?\s*down\s*by|split\s*by|for\s*each)\s+(.+?)(?:\s+(?:for|in|during|over|last|this|from).*)?$/);
  if (byPattern) {
    const metricPart = byPattern[1].trim();
    const dimPart = byPattern[2].trim();
    const resolvedMetric = resolveMetric(metricPart, metadata || null);
    const resolvedDim = resolveDimension(dimPart, metadata || null);
    if (resolvedMetric && resolvedDim) {
      return {
        params: {
          startDate: dateRange.start, endDate: dateRange.end,
          dimensions: [resolvedDim],
          metrics: [resolvedMetric, "totalUsers"],
          orderBy: resolvedMetric, orderDesc: true, limit: 20,
        },
        summary_template: "dynamic", chartType: "bar",
        comparison: wantsComparison,
      };
    }
  }

  // ── JOB APPLY ──
  if (lower.match(/job.?appl|apply|applies|application/) && !lower.match(/engag|bounce|traffic|overview/)) {
    const company = detectCompanyInQuery(query);
    const wantsByCompany = !!lower.match(/by\s*company|broken?\s*down.*company|per\s*company|each\s*company/);

    if (wantsByCompany) {
      // Show all job_apply events broken down by company
      return {
        params: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          dimensions: ["eventName"],
          metrics: ["eventCount", "totalUsers"],
          orderBy: "eventCount",
          orderDesc: true,
          limit: 30,
          dimensionFilter: {
            filter: { fieldName: "eventName", stringFilter: { matchType: "BEGINS_WITH", value: "job_apply" } },
          },
        },
        summary_template: "job_apply_breakdown",
        chartType: "table",
        comparison: wantsComparison,
      };
    }

    if (company) {
      // Specific company job apply over time
      return {
        params: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          dimensions: ["date"],
          metrics: ["eventCount", "totalUsers"],
          orderBy: "date",
          orderDesc: false,
          dimensionFilter: {
            filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: `job_apply_${company}` } },
          },
        },
        summary_template: "job_apply_company",
        chartType: "line",
        comparison: wantsComparison,
      };
    }

    // Aggregate job_apply (all combined) over time
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: wantsGeoBreakdown ? ["country"] : ["date"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: wantsGeoBreakdown ? "eventCount" : "date",
        orderDesc: wantsGeoBreakdown,
        limit: wantsGeoBreakdown ? 20 : undefined,
        dimensionFilter: {
          filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "job_apply" } },
        },
      },
      summary_template: "job_apply_trend",
      chartType: wantsGeoBreakdown ? "bar" : "line",
      comparison: wantsComparison,
      geoBreakdown: wantsGeoBreakdown && !lower.match(/by\s*(country|countries|city|cities|geo|region)/),
    };
  }

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

  // ── CHATBOT ──
  if (lower.match(/chatbot|chat\s*bot/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["date"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: "date",
        orderDesc: false,
        dimensionFilter: {
          filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "chatbot_interaction" } },
        },
      },
      summary_template: "chatbot",
      chartType: "line",
      comparison: wantsComparison,
    };
  }

  // ── FORM / K&B SUBMISSIONS ──
  if (lower.match(/form|submission|k&b|k\s*and\s*b/)) {
    const isKB = lower.match(/k&b|k\s*and\s*b/);
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["date"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: "date",
        orderDesc: false,
        dimensionFilter: {
          filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: isKB ? "k&b_submissions" : "form_start" } },
        },
      },
      summary_template: "form_events",
      chartType: "line",
      comparison: wantsComparison,
    };
  }

  // ── SIGN IN ──
  if (lower.match(/sign.?in|login|log.?in/)) {
    return {
      params: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ["date"],
        metrics: ["eventCount", "totalUsers"],
        orderBy: "date",
        orderDesc: false,
        dimensionFilter: {
          filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "sign_in_click" } },
        },
      },
      summary_template: "sign_in",
      chartType: "line",
      comparison: wantsComparison,
    };
  }

  // ── EVENTS / CONVERSIONS (general) ──
  if (lower.match(/event|conversion|click|interact/)) {
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

    case "job_apply_trend": {
      const totalApplies = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
      const totalApplyUsers = rows.reduce((s, r) => s + (Number(r.totalUsers) || 0), 0);

      let summary = `Job apply overview for ${period}:\n\n` +
        `Total Applies: ${totalApplies.toLocaleString()}\n` +
        `Unique Users Who Applied: ${totalApplyUsers.toLocaleString()}\n` +
        `Avg Applies per User: ${totalApplyUsers > 0 ? (totalApplies / totalApplyUsers).toFixed(1) : "0"}\n`;

      if (comparisonRows && comparisonRows.length > 0 && comparisonDateRange) {
        const prevApplies = comparisonRows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
        const change = prevApplies > 0 ? (((totalApplies - prevApplies) / prevApplies) * 100).toFixed(1) : "N/A";
        summary += `\nComparison vs ${comparisonDateRange.start} to ${comparisonDateRange.end}:\n` +
          `Previous Period Applies: ${prevApplies.toLocaleString()}\n` +
          `Change: ${change}%\n`;
        if (typeof change === "string" && parseFloat(change) < -10) summary += `\n⚠️ Significant drop in job applies.`;
        else if (typeof change === "string" && parseFloat(change) > 10) summary += `\n✅ Job applies trending up.`;
      }

      summary += `\n\nTrend shown below:`;
      return summary;
    }

    case "job_apply_company": {
      const totalApplies = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
      return `Job applies for this company over ${period}:\n\n` +
        `Total: ${totalApplies.toLocaleString()} applies\n\n` +
        `Daily trend shown below:`;
    }

    case "job_apply_breakdown": {
      const filtered = rows.filter(r => String(r.eventName).startsWith("job_apply"));
      return `Job applies by company for ${period}:\n\n` +
        filtered.slice(0, 5).map((r, i) => {
          const name = String(r.eventName).replace("job_apply_", "").replace(/_/g, " ");
          return `${i + 1}. ${name || "Generic"} — ${Number(r.eventCount).toLocaleString()} applies`;
        }).join("\n") +
        `\n\nFull breakdown below:`;
    }

    case "dynamic": {
      if (!rows[0]) return `No data for ${period}.`;
      const dims = Object.keys(rows[0]).filter((k) => typeof rows[0][k] === "string");
      const mets = Object.keys(rows[0]).filter((k) => typeof rows[0][k] === "number");
      return `Results for ${period}:\n\n` +
        rows.slice(0, 5).map((r, i) => {
          const dimVals = dims.map((d) => r[d]).join(" / ");
          const metVals = mets.map((m) => `${m}: ${Number(r[m]).toLocaleString()}`).join(", ");
          return `${i + 1}. ${dimVals} — ${metVals}`;
        }).join("\n") + `\n\nFull breakdown below:`;
    }

    case "funnel": {
      return `Funnel analysis for ${period}. Results below:`;
    }

    case "path": {
      return `Path analysis for ${period}. Top user paths below:`;
    }

    case "chatbot": {
      const total = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
      return `Chatbot interactions for ${period}: ${total.toLocaleString()} total interactions.\n\nDaily trend shown below:`;
    }

    case "form_events": {
      const total = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
      return `Form submissions for ${period}: ${total.toLocaleString()} total.\n\nDaily trend shown below:`;
    }

    case "sign_in": {
      const total = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
      return `Sign-in clicks for ${period}: ${total.toLocaleString()} total.\n\nDaily trend shown below:`;
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
