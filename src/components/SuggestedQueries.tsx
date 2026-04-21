"use client";

const suggestions = [
  { label: "Traffic Overview", query: "Show me traffic overview for last 30 days" },
  { label: "Top Pages", query: "What are my top pages this month?" },
  { label: "Traffic Sources", query: "Where is my traffic coming from?" },
  { label: "User Locations", query: "Which countries are my users from?" },
  { label: "Device Breakdown", query: "What devices are people using?" },
  { label: "Events & Conversions", query: "Show me top events last 30 days" },
];

export function SuggestedQueries({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {suggestions.map((s) => (
        <button
          key={s.label}
          onClick={() => onSelect(s.query)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
