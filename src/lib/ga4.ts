import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (!client) {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "{}");
    client = new BetaAnalyticsDataClient({ credentials });
  }
  return client;
}

function getPropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error("GA4_PROPERTY_ID not set");
  return id;
}

export interface GA4QueryParams {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  dimensionFilter?: Record<string, unknown>;
  metricFilter?: Record<string, unknown>;
  limit?: number;
  orderBy?: string;
  orderDesc?: boolean;
}

export interface GA4Row { [key: string]: string | number; }

export interface GA4MetadataItem {
  apiName: string; uiName: string; description: string; category: string; customDefinition: boolean;
}

// ─── Standard Report ───
export async function runGA4Report(params: GA4QueryParams): Promise<GA4Row[]> {
  const analyticsClient = getClient();
  const request: Record<string, unknown> = {
    property: `properties/${getPropertyId()}`,
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions: params.dimensions.map((name) => ({ name })),
    metrics: params.metrics.map((name) => ({ name })),
    limit: params.limit || 50,
  };
  if (params.dimensionFilter) request.dimensionFilter = params.dimensionFilter;
  if (params.metricFilter) request.metricFilter = params.metricFilter;
  if (params.orderBy) {
    const isMetric = params.metrics.includes(params.orderBy);
    request.orderBys = [{
      ...(isMetric ? { metric: { metricName: params.orderBy } } : { dimension: { dimensionName: params.orderBy } }),
      desc: params.orderDesc ?? true,
    }];
  }
  const [response] = await analyticsClient.runReport(request);
  const rows: GA4Row[] = [];
  if (response.rows) {
    for (const row of response.rows) {
      const obj: GA4Row = {};
      row.dimensionValues?.forEach((dv, i) => { obj[params.dimensions[i]] = dv.value || ""; });
      row.metricValues?.forEach((mv, i) => {
        const val = mv.value || "0";
        obj[params.metrics[i]] = val.includes(".") ? parseFloat(val) : parseInt(val, 10);
      });
      rows.push(obj);
    }
  }
  return rows;
}

// ─── Funnel Report (simulated via sequential event queries) ───
export interface FunnelStep { name: string; eventName: string; }
export interface FunnelResult { stepName: string; users: number; rate: number; dropoff: number; }

export async function runFunnelReport(params: {
  startDate: string; endDate: string; steps: FunnelStep[];
}): Promise<FunnelResult[]> {
  const results: FunnelResult[] = [];
  for (const step of params.steps) {
    const rows = await runGA4Report({
      startDate: params.startDate, endDate: params.endDate,
      dimensions: ["eventName"], metrics: ["totalUsers"],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: step.eventName } } },
      limit: 1,
    });
    results.push({ stepName: step.name, users: rows.length > 0 ? Number(rows[0].totalUsers) || 0 : 0, rate: 0, dropoff: 0 });
  }
  for (let i = 0; i < results.length; i++) {
    if (i === 0) { results[i].rate = 100; }
    else {
      const prev = results[i - 1].users;
      results[i].rate = prev > 0 ? Math.round((results[i].users / prev) * 1000) / 10 : 0;
      results[i].dropoff = prev - results[i].users;
    }
  }
  return results;
}

// ─── Path/Flow Analysis ───
export async function runPathAnalysis(params: {
  startDate: string; endDate: string; eventName?: string; pagePath?: string;
}): Promise<GA4Row[]> {
  const dimFilter = params.eventName
    ? { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: params.eventName } } }
    : params.pagePath
    ? { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: params.pagePath } } }
    : undefined;
  return runGA4Report({
    startDate: params.startDate, endDate: params.endDate,
    dimensions: ["pagePath", "eventName"],
    metrics: ["eventCount", "totalUsers"],
    orderBy: "eventCount", orderDesc: true, limit: 25,
    dimensionFilter: dimFilter,
  });
}

// ─── Get Property Metadata (all available dimensions & metrics) ───
let metaCache: { dimensions: GA4MetadataItem[]; metrics: GA4MetadataItem[] } | null = null;

export async function getPropertyMetadata(): Promise<{ dimensions: GA4MetadataItem[]; metrics: GA4MetadataItem[] }> {
  if (metaCache) return metaCache;
  const analyticsClient = getClient();
  const [response] = await analyticsClient.getMetadata({ name: `properties/${getPropertyId()}/metadata` });
  metaCache = {
    dimensions: (response.dimensions || []).map((d) => ({
      apiName: d.apiName || "", uiName: d.uiName || "", description: d.description || "",
      category: d.category || "", customDefinition: d.customDefinition || false,
    })),
    metrics: (response.metrics || []).map((m) => ({
      apiName: m.apiName || "", uiName: m.uiName || "", description: m.description || "",
      category: m.category || "", customDefinition: m.customDefinition || false,
    })),
  };
  return metaCache;
}
