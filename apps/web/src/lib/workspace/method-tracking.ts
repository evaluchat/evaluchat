import { Client } from "@langchain/langgraph-sdk";
import { LANGGRAPH_API_URL } from "@/constants";
import { isValidTrackingId } from "@/lib/teaching/tracking-validation";

function client(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

function namespace(threadId: string): string[] {
  return ["workspace_tracking", threadId];
}

export async function appendTrackingEvents(
  threadId: string,
  events: unknown[]
): Promise<void> {
  if (!isValidTrackingId(threadId) || !Array.isArray(events) || !events.length) {
    return;
  }
  const existing = await client().store.getItem(namespace(threadId), "events");
  const current = Array.isArray((existing?.value as { events?: unknown[] })?.events)
    ? ((existing?.value as { events: unknown[] }).events)
    : [];
  await client().store.putItem(namespace(threadId), "events", {
    events: [...current, ...events],
  });
}

export async function readTrackingEvents(threadId: string): Promise<unknown[]> {
  if (!isValidTrackingId(threadId)) return [];
  const existing = await client().store.getItem(namespace(threadId), "events");
  const events = (existing?.value as { events?: unknown[] })?.events;
  return Array.isArray(events) ? events : [];
}

export function aggregateTrackingMetrics(
  threadId: string,
  events: unknown[]
): Record<string, unknown> {
  const summaries = events.filter(
    (event): event is Record<string, any> =>
      Boolean(event) &&
      typeof event === "object" &&
      (event as { type?: unknown }).type === "session_summary"
  );
  const sum = (key: string) =>
    summaries.reduce((total, event) => total + Number(event[key] || 0), 0);
  return {
    threadId,
    sessionCount: summaries.length,
    totalTimeMs: sum("durationMs"),
    totalKeystrokes: sum("keystrokes"),
    totalTypingBursts: sum("typingBursts"),
    totalBurstWords: sum("totalBurstWords"),
    totalPasteEvents: sum("pasteEvents"),
    totalPastedChars: sum("pastedChars"),
    totalCopyEvents: sum("copyEvents"),
    totalCutEvents: sum("cutEvents"),
    totalCanvasEdits: sum("canvasEdits"),
    totalCanvasInsertions: sum("canvasInsertions"),
    totalCanvasDeletions: sum("canvasDeletions"),
    totalCanvasReplace: sum("canvasReplaces"),
    totalFocus: sum("focusCount"),
    totalBlur: sum("blurCount"),
    totalVisibilityHidden: sum("visibilityHiddenCount"),
    sessions: summaries,
  };
}
