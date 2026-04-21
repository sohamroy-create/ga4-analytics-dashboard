"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ChartData {
  rows: Record<string, unknown>[];
  dimensions: string[];
  metrics: string[];
}

interface ChartDisplayProps {
  data: Record<string, unknown>;
  chartType: "bar" | "line";
}

const COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6"];

const metricLabels: Record<string, string> = {
  totalUsers: "Users",
  sessions: "Sessions",
  screenPageViews: "Page Views",
  bounceRate: "Bounce Rate (%)",
  engagementRate: "Engagement Rate (%)",
  newUsers: "New Users",
  averageSessionDuration: "Avg Duration (s)",
  sessionsPerUser: "Sessions/User",
  eventCount: "Event Count",
};

function formatLabel(key: string): string {
  return metricLabels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function ChartDisplay({ data, chartType }: ChartDisplayProps) {
  const chartData = data as unknown as ChartData;
  const { rows, dimensions, metrics } = chartData;

  if (!rows || rows.length === 0) return null;

  const xKey = dimensions[0];
  const displayMetrics = metrics.filter((m) => m !== "bounceRate" || metrics.length <= 2);

  const ChartComponent = chartType === "line" ? LineChart : BarChart;

  return (
    <div className="w-full h-80 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval={rows.length > 20 ? Math.floor(rows.length / 10) : 0}
            angle={rows.length > 10 ? -45 : 0}
            textAnchor={rows.length > 10 ? "end" : "middle"}
            height={rows.length > 10 ? 60 : 30}
          />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          {displayMetrics.length > 1 && <Legend wrapperStyle={{ fontSize: "12px" }} />}
          {displayMetrics.map((metric, i) =>
            chartType === "line" ? (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                name={formatLabel(metric)}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={rows.length <= 30}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Bar
                key={metric}
                dataKey={metric}
                name={formatLabel(metric)}
                fill={COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            )
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
