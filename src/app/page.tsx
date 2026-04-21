"use client";

import { useState, useRef, useEffect } from "react";
import { ChartDisplay } from "@/components/ChartDisplay";
import { TableDisplay } from "@/components/TableDisplay";
import { SuggestedQueries } from "@/components/SuggestedQueries";

interface Message {
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>;
  chartType?: "bar" | "line" | "table" | "metric";
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendQuery = async (query: string) => {
    if (!query.trim() || loading) return;

    const userMsg: Message = {
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to fetch data");
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: result.summary,
        data: result.data,
        chartType: result.chartType,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        role: "assistant",
        content: `Sorry, I couldn't process that query. ${err instanceof Error ? err.message : "Please try again."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">GA4 Analytics Assistant</h1>
            <p className="text-sm text-gray-500">Ask questions about your website performance</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                What would you like to know?
              </h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Ask me anything about your GA4 analytics — traffic, user behavior, top pages, conversions, and more.
              </p>
              <SuggestedQueries onSelect={sendQuery} />
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`animate-fade-in ${msg.role === "user" ? "flex justify-end" : ""}`}>
              {msg.role === "user" ? (
                <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-br-md max-w-lg">
                  <p>{msg.content}</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 max-w-full">
                  <p className="text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                  {msg.data && msg.chartType === "table" && (
                    <div className="mt-4">
                      <TableDisplay data={msg.data} />
                    </div>
                  )}
                  {msg.data && msg.chartType && msg.chartType !== "table" && msg.chartType !== "metric" && (
                    <div className="mt-4">
                      <ChartDisplay data={msg.data} chartType={msg.chartType} />
                    </div>
                  )}
                  {msg.data && msg.chartType === "metric" && (
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(msg.data as Record<string, string | number>).map(([key, val]) => (
                        <div key={key} className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-2xl font-bold text-indigo-600">{String(val)}</p>
                          <p className="text-xs text-gray-500 mt-1">{key}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="animate-fade-in">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 max-w-[100px]">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-400 typing-dot"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 typing-dot"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 typing-dot"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your analytics... (e.g., 'What was our traffic last week?')"
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
