import { NextResponse } from "next/server";
import { runGA4Report, runFunnelReport, runPathAnalysis, getPropertyMetadata } from "@/lib/ga4";
import { parseQuery, buildSummary, checkClarification, isFollowUp, mergeWithContext } from "@/lib/queryParser";

interface ConversationContext {
  lastQuery: string;
  lastIntent: string;
  lastMetrics: string[];
  lastDimensions: string[];
  lastDateRange: { start: string; end: string };
  lastFilters?: Record<string, unknown>;
}

function formatRows(rows: Record<string, string | number>[]) {
  return rows.map((row) => {
    const formatted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === "date" && typeof value === "string" && value.length === 8) {
        formatted[key] = `${value.slice(4, 6)}/${value.slice(6, 8)}`;
      } else if ((key === "bounceRate" || key === "engagementRate") && typeof value === "number") {
        formatted[key] = Math.round(value * 100 * 10) / 10;
      } else if (key === "averageSessionDuration" && typeof value === "number") {
        formatted[key] = Math.round(value);
      } else if (key === "sessionsPerUser" && typeof value === "number") {
        formatted[key] = Math.round(value * 100) / 100;
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  });
}

/** Calculate comparison date range (same length, immediately prior) */
function getComparisonRange(startDate: string, endDate: string): { start: string; end: string } {
  const daysAgoMatch = startDate.match(/^(\d+)daysAgo$/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    return { start: `${days * 2}daysAgo`, end: `${days + 1}daysAgo` };
  }
  if (startDate === "today") return { start: "yesterday", end: "yesterday" };
  if (startDate === "yesterday") return { start: "2daysAgo", end: "2daysAgo" };

  // For absolute dates, calculate the previous period
  const start = new Date(startDate);
  const end = endDate === "today" ? new Date() : new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000); // day before start
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

export async function POST(request: Request) {
  try {
    const { query, skipClarification, conversationContext } = await request.json();
    const ctx = conversationContext as ConversationContext | null;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !process.env.GA4_PROPERTY_ID) {
      return NextResponse.json(
        { error: "GA4 credentials are not configured. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON and GA4_PROPERTY_ID environment variables." },
        { status: 500 }
      );
    }

    // Step 0: Check if this is a follow-up query that references previous context
    let effectiveQuery = query;
    let isContextFollowUp = false;
    if (ctx && isFollowUp(query)) {
      effectiveQuery = mergeWithContext(query, ctx);
      isContextFollowUp = true; // Skip clarification for follow-ups — user already gave context
    }

    // Step 1: Check if we need to ask clarifying questions
    // Skip clarification for follow-ups (context already provides the needed info)
    if (!skipClarification && !isContextFollowUp) {
      const clarification = checkClarification(effectiveQuery);
      if (clarification) {
        return NextResponse.json({
          type: "clarification",
          message: clarification.message,
          questions: clarification.questions,
        });
      }
    }

    // Step 2: Parse and execute the query (with metadata awareness)
    let metadata;
    try { metadata = await getPropertyMetadata(); } catch { metadata = null; }
    const parsed = parseQuery(effectiveQuery, metadata);

    // ── Handle funnel reports ──
    if (parsed.reportType === "funnel" && parsed.funnelSteps) {
      const funnelResults = await runFunnelReport({
        startDate: parsed.params.startDate, endDate: parsed.params.endDate,
        steps: parsed.funnelSteps,
      });
      const funnelRows = funnelResults.map((r) => ({
        step: r.stepName, users: r.users, conversionRate: r.rate, dropoff: r.dropoff,
      }));
      const totalStart = funnelResults[0]?.users || 0;
      const totalEnd = funnelResults[funnelResults.length - 1]?.users || 0;
      const overallRate = totalStart > 0 ? ((totalEnd / totalStart) * 100).toFixed(1) : "0";
      const summaryText = `Funnel analysis for ${parsed.params.startDate} to ${parsed.params.endDate}:\n\n` +
        funnelResults.map((r, i) => `${i + 1}. ${r.stepName}: ${r.users.toLocaleString()} users${i > 0 ? ` (${r.rate}% conversion, ${r.dropoff.toLocaleString()} dropped)` : ""}`).join("\n") +
        `\n\nOverall conversion: ${overallRate}% (${totalStart.toLocaleString()} → ${totalEnd.toLocaleString()})`;
      return NextResponse.json({
        type: "data", summary: summaryText,
        data: { rows: funnelRows, dimensions: ["step"], metrics: ["users", "conversionRate", "dropoff"] },
        chartType: "funnel",
        context: { lastQuery: effectiveQuery, lastIntent: "funnel", lastMetrics: ["totalUsers"], lastDimensions: ["eventName"], lastDateRange: { start: parsed.params.startDate, end: parsed.params.endDate } },
      });
    }

    // ── Handle path analysis ──
    if (parsed.reportType === "path") {
      const pathRows = await runPathAnalysis({
        startDate: parsed.params.startDate, endDate: parsed.params.endDate,
        eventName: parsed.pathEvent, pagePath: parsed.pathPage,
      });
      const formattedPaths = formatRows(pathRows);
      const summaryText = `Path analysis for ${parsed.params.startDate} to ${parsed.params.endDate}:\n\n` +
        `Showing pages and events${parsed.pathEvent ? ` related to "${parsed.pathEvent}"` : ""}${parsed.pathPage ? ` on "${parsed.pathPage}"` : ""}.\n` +
        `Top ${Math.min(pathRows.length, 10)} paths shown below:`;
      return NextResponse.json({
        type: "data", summary: summaryText,
        data: { rows: formattedPaths, dimensions: ["pagePath", "eventName"], metrics: ["eventCount", "totalUsers"] },
        chartType: "table",
        context: { lastQuery: effectiveQuery, lastIntent: "path", lastMetrics: ["eventCount", "totalUsers"], lastDimensions: ["pagePath", "eventName"], lastDateRange: { start: parsed.params.startDate, end: parsed.params.endDate } },
      });
    }

    // ── Standard report ──
    const rows = await runGA4Report(parsed.params);

    // Step 3: If comparison requested, run the comparison report
    let comparisonRows: Record<string, string | number>[] | undefined;
    let comparisonDateRange: { start: string; end: string } | undefined;

    if (parsed.comparison) {
      comparisonDateRange = getComparisonRange(parsed.params.startDate, parsed.params.endDate);
      comparisonRows = await runGA4Report({
        ...parsed.params,
        startDate: comparisonDateRange.start,
        endDate: comparisonDateRange.end,
      });
    }

    // Step 4: If geo breakdown requested AND the main query wasn't already geo, run an extra geo report
    let geoData: Record<string, unknown> | undefined;
    if (parsed.geoBreakdown) {
      const geoRows = await runGA4Report({
        startDate: parsed.params.startDate,
        endDate: parsed.params.endDate,
        dimensions: ["country"],
        metrics: parsed.params.metrics,
        orderBy: "totalUsers",
        orderDesc: true,
        limit: 15,
      });
      geoData = {
        rows: formatRows(geoRows),
        dimensions: ["country"],
        metrics: parsed.params.metrics,
      };
    }

    // Build summary with comparison data
    const summary = buildSummary(
      parsed.summary_template,
      rows,
      { start: parsed.params.startDate, end: parsed.params.endDate },
      comparisonRows,
      comparisonDateRange
    );

    const chartData = formatRows(rows);

    // Build conversation context for follow-up queries
    const newContext: ConversationContext = {
      lastQuery: effectiveQuery,
      lastIntent: parsed.summary_template,
      lastMetrics: parsed.params.metrics,
      lastDimensions: parsed.params.dimensions,
      lastDateRange: { start: parsed.params.startDate, end: parsed.params.endDate },
      lastFilters: parsed.params.dimensionFilter,
    };

    const response: Record<string, unknown> = {
      type: "data",
      summary,
      data: {
        rows: chartData,
        dimensions: parsed.params.dimensions,
        metrics: parsed.params.metrics,
      },
      chartType: parsed.chartType,
      context: newContext,
    };

    if (geoData) {
      response.geoData = geoData;
      response.geoChartType = "table";
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Query error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
