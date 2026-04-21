import { NextResponse } from "next/server";
import { runGA4Report } from "@/lib/ga4";
import { parseQuery, buildSummary } from "@/lib/queryParser";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Check if GA4 credentials are configured
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !process.env.GA4_PROPERTY_ID) {
      return NextResponse.json(
        { error: "GA4 credentials are not configured. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON and GA4_PROPERTY_ID environment variables." },
        { status: 500 }
      );
    }

    // Parse the natural language query into GA4 parameters
    const parsed = parseQuery(query);

    // Run the GA4 report
    const rows = await runGA4Report(parsed.params);

    // Build a human-readable summary
    const summary = buildSummary(parsed.summary_template, rows, {
      start: parsed.params.startDate,
      end: parsed.params.endDate,
    });

    // Format chart data
    const chartData = rows.map((row) => {
      const formatted: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === "date" && typeof value === "string" && value.length === 8) {
          // Format YYYYMMDD to readable date
          formatted[key] = `${value.slice(4, 6)}/${value.slice(6, 8)}`;
        } else if (key === "bounceRate" && typeof value === "number") {
          formatted[key] = Math.round(value * 100 * 10) / 10;
        } else if (key === "averageSessionDuration" && typeof value === "number") {
          formatted[key] = Math.round(value);
        } else {
          formatted[key] = value;
        }
      }
      return formatted;
    });

    return NextResponse.json({
      summary,
      data: {
        rows: chartData,
        dimensions: parsed.params.dimensions,
        metrics: parsed.params.metrics,
      },
      chartType: parsed.chartType,
    });
  } catch (error) {
    console.error("Query error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
