import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (!client) {
    const credentials = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "{}"
    );
    client = new BetaAnalyticsDataClient({ credentials });
  }
  return client;
}

export interface GA4QueryParams {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  dimensionFilter?: Record<string, unknown>;
  limit?: number;
  orderBy?: string;
  orderDesc?: boolean;
}

export interface GA4Row {
  [key: string]: string | number;
}

export async function runGA4Report(params: GA4QueryParams): Promise<GA4Row[]> {
  const analyticsClient = getClient();
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID environment variable is not set");
  }

  const dimensions = params.dimensions.map((name) => ({ name }));
  const metrics = params.metrics.map((name) => ({ name }));

  const request: Record<string, unknown> = {
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions,
    metrics,
    limit: params.limit || 50,
  };

  if (params.dimensionFilter) {
    request.dimensionFilter = params.dimensionFilter;
  }

  if (params.orderBy) {
    const isMetric = params.metrics.includes(params.orderBy);
    request.orderBys = [
      {
        ...(isMetric
          ? { metric: { metricName: params.orderBy } }
          : { dimension: { dimensionName: params.orderBy } }),
        desc: params.orderDesc ?? true,
      },
    ];
  }

  const [response] = await analyticsClient.runReport(request);

  const rows: GA4Row[] = [];
  if (response.rows) {
    for (const row of response.rows) {
      const obj: GA4Row = {};
      row.dimensionValues?.forEach((dv, i) => {
        obj[params.dimensions[i]] = dv.value || "";
      });
      row.metricValues?.forEach((mv, i) => {
        const val = mv.value || "0";
        obj[params.metrics[i]] = val.includes(".") ? parseFloat(val) : parseInt(val, 10);
      });
      rows.push(obj);
    }
  }

  return rows;
}
