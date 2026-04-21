"use client";

interface TableData {
  rows: Record<string, unknown>[];
  dimensions: string[];
  metrics: string[];
}

const columnLabels: Record<string, string> = {
  pagePath: "Page",
  landingPage: "Landing Page",
  sessionSourceMedium: "Source / Medium",
  country: "Country",
  city: "City",
  deviceCategory: "Device",
  browser: "Browser",
  eventName: "Event",
  searchTerm: "Search Term",
  isoYearIsoWeek: "Week",
  date: "Date",
  totalUsers: "Users",
  sessions: "Sessions",
  screenPageViews: "Page Views",
  bounceRate: "Bounce Rate",
  newUsers: "New Users",
  averageSessionDuration: "Avg Duration",
  eventCount: "Count",
};

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "bounceRate") return `${Number(value).toFixed(1)}%`;
  if (key === "averageSessionDuration") return `${Number(value)}s`;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function TableDisplay({ data }: { data: Record<string, unknown> }) {
  const tableData = data as unknown as TableData;
  const { rows, dimensions, metrics } = tableData;

  if (!rows || rows.length === 0) return null;

  const columns = [...dimensions, ...metrics];

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th key={col} className="px-4 py-2.5 text-left font-medium text-gray-600 whitespace-nowrap">
                {columnLabels[col] || col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              {columns.map((col) => (
                <td key={col} className="px-4 py-2 text-gray-800 whitespace-nowrap">
                  {formatCell(col, row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
