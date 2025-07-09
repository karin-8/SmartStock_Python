
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";

interface Insight {
  sku: string;
  name: string;
  slopes: number[];
}

interface Analytics {
  demand_spike: Insight[];
  low_stock_trend: Insight[];
}

interface AiInsightResponse {
  success: boolean;
  summary: string;
  raw_analytics: Analytics;
}

export default function AIInsights({ plant }: { plant: string }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!plant) return;
    setLoading(true);
    fetch(`http://localhost:8000/api/ai-insight?plant=${plant}`)
      .then((res) => res.json())
      .then((data: AiInsightResponse) => {
        if (data.success && data.summary) {
          setSummary(data.summary);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load AI Insight:", err);
        setLoading(false);
      });
  }, [plant]);

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:border-blue-400">
      <CardHeader>
        <CardTitle>AI Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-20 w-full mb-2" />
            <Skeleton className="h-20 w-full mb-2" />
          </>
        ) : summary ? (
          <div
            className={`prose prose-sm max-w-none text-gray-800 ${
              expanded ? "" : "line-clamp-4 overflow-hidden"
            }`}
            onClick={() => setExpanded(!expanded)}
            style={{ cursor: "pointer" }}
          >
            <ReactMarkdown>{summary}</ReactMarkdown>
            {!expanded && (
              <span className="text-sm text-blue-600 underline ml-1">ดูเพิ่มเติม</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No insight available.</p>
        )}
      </CardContent>
    </Card>
  );
}
