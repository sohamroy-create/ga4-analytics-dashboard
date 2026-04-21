import { NextResponse } from "next/server";
import { runGA4Report } from "@/lib/ga4";
import { parseQuery, buildSummary, checkClarification, getDateRange } from "@/lib/queryParser";

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
    const { query, skipClarification } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !process.env.GA4_PROPERTY_ID) {
      return NextResponse.json(
        { error: "GA4 credentials are not configured. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON and GA4_PROPERTY_ID environment variables." },
        { status: 500 }
      );
    }

    // Step 1: Check if we need to ask clarifying questions
    if (!skipClarification) {
      const clarification = checkClarification(query);
      if (clarification) {
        return NextResponse.json({
          type: "clarification",
          message: clarification.message,
          questions: clarification.questions,
        });
      }
    }

    // Step 2: Parse and execute the query
    const parsed = parseQuery(query);
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

    const response: Record<string, unknown> = {
      type: "data",
      summary,
      data: {
        rows: chartData,
        dimensions: parsed.params.dimensions,
        metrics: parsed.params.metrics,
      },
      chartType: parsed.chartType,
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
