import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function useTypingLoop(text: string, speed = 100, delay = 800) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    let i = 0;
    let isDeleting = false;
    let timeout: NodeJS.Timeout;

    const type = () => {
      if (!isDeleting) {
        setDisplayed(text.slice(0, i + 1));
        i++;
        if (i === text.length) {
          isDeleting = true;
          timeout = setTimeout(type, delay);
          return;
        }
      } else {
        setDisplayed(text.slice(0, i - 1));
        i--;
        if (i === 0) {
          isDeleting = false;
        }
      }
      timeout = setTimeout(type, speed);
    };

    timeout = setTimeout(type, speed);
    return () => clearTimeout(timeout);
  }, [text, speed, delay]);

  return displayed;
}

export default function AIInsights({ plant }: { plant: string }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const typing = useTypingLoop("กำลังวิเคราะห์...", 80, 800);

  const handleGenerate = () => {
    if (!plant) return;
    setLoading(true);
    setExpanded(false);
    setSummary(null);

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
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:border-blue-400">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>AI Summary</CardTitle>
        <Button onClick={handleGenerate} disabled={loading || !plant}>
          {loading ? "Analyzing..." : "Generate"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500 italic">{typing}</p>
        ) : summary ? (
          <div
            className={`prose prose-sm max-w-none text-gray-800 transition-all duration-300 ease-in-out cursor-pointer ${
              expanded ? "" : "line-clamp-4"
            }`}
            onClick={() => setExpanded(!expanded)}
          >
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {plant ? "Click generate to view AI insight." : "Please select a plant first."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
