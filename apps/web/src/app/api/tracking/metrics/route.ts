import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { isTrackingAllowedForThread } from "@/lib/teaching/tracking-policy";

const DATA_DIR = join(process.cwd(), "data", "tracking");

interface SessionMetrics {
  sessionId: string;
  startTime: number | null;
  endTime: number | null;
  durationMs: number;
  keystrokes: number;
  typingBursts: number;
  totalBurstWords: number;
  avgBurstDurationMs: number;
  pasteEvents: number;
  pastedChars: number;
  copyEvents: number;
  cutEvents: number;
  canvasEdits: number;
  canvasInsertions: number;
  canvasDeletions: number;
  canvasReplace: number;
  focusCount: number;
  blurCount: number;
  visibilityHidden: number;
}

interface AggregatedMetrics {
  threadId: string;
  sessionCount: number;
  totalTimeMs: number;
  firstActivity: number | null;
  lastActivity: number | null;
  totalKeystrokes: number;
  totalTypingBursts: number;
  totalBurstWords: number;
  avgBurstDurationMs: number;
  totalPasteEvents: number;
  totalPastedChars: number;
  totalCopyEvents: number;
  totalCutEvents: number;
  totalCanvasEdits: number;
  totalCanvasInsertions: number;
  totalCanvasDeletions: number;
  totalCanvasReplace: number;
  totalFocus: number;
  totalBlur: number;
  totalVisibilityHidden: number;
  sessions: SessionMetrics[];
}

const EMPTY_METRICS: AggregatedMetrics = {
  threadId: "",
  sessionCount: 0,
  totalTimeMs: 0,
  firstActivity: null,
  lastActivity: null,
  totalKeystrokes: 0,
  totalTypingBursts: 0,
  totalBurstWords: 0,
  avgBurstDurationMs: 0,
  totalPasteEvents: 0,
  totalPastedChars: 0,
  totalCopyEvents: 0,
  totalCutEvents: 0,
  totalCanvasEdits: 0,
  totalCanvasInsertions: 0,
  totalCanvasDeletions: 0,
  totalCanvasReplace: 0,
  totalFocus: 0,
  totalBlur: 0,
  totalVisibilityHidden: 0,
  sessions: [],
};

/**
 * Process a single session file. Handles both:
 * - New format: session_summary events (pre-aggregated client-side)
 * - Old format: individual events (keystroke, paste, etc.)
 *
 * For session_summary, the latest summary contains the most complete data.
 */
function processSessionFile(sessionId: string, events: any[]): SessionMetrics {
  const sm: SessionMetrics = {
    sessionId,
    startTime: null,
    endTime: null,
    durationMs: 0,
    keystrokes: 0,
    typingBursts: 0,
    totalBurstWords: 0,
    avgBurstDurationMs: 0,
    pasteEvents: 0,
    pastedChars: 0,
    copyEvents: 0,
    cutEvents: 0,
    canvasEdits: 0,
    canvasInsertions: 0,
    canvasDeletions: 0,
    canvasReplace: 0,
    focusCount: 0,
    blurCount: 0,
    visibilityHidden: 0,
  };

  // Find the latest session_summary (if any)
  const summaries = events.filter((e) => e.type === "session_summary");
  const latestSummary =
    summaries.length > 0 ? summaries[summaries.length - 1] : null;

  if (latestSummary) {
    // New format: use pre-aggregated data from the latest summary
    sm.startTime = latestSummary.timestamp - (latestSummary.durationMs ?? 0);
    sm.endTime = latestSummary.timestamp;
    sm.durationMs = latestSummary.durationMs ?? 0;
    sm.keystrokes = latestSummary.keystrokes ?? 0;
    sm.typingBursts = latestSummary.typingBursts ?? 0;
    sm.totalBurstWords = latestSummary.totalBurstWords ?? 0;
    sm.avgBurstDurationMs = latestSummary.avgBurstDurationMs ?? 0;
    sm.pasteEvents = latestSummary.pasteEvents ?? 0;
    sm.pastedChars = latestSummary.pastedChars ?? 0;
    sm.copyEvents = latestSummary.copyEvents ?? 0;
    sm.cutEvents = latestSummary.cutEvents ?? 0;
    sm.canvasEdits = latestSummary.canvasEdits ?? 0;
    sm.canvasInsertions = latestSummary.canvasInsertions ?? 0;
    sm.canvasDeletions = latestSummary.canvasDeletions ?? 0;
    sm.canvasReplace = latestSummary.canvasReplaces ?? 0;
    sm.focusCount = latestSummary.focusCount ?? 0;
    sm.blurCount = latestSummary.blurCount ?? 0;
    sm.visibilityHidden = latestSummary.visibilityHiddenCount ?? 0;
  } else {
    // Legacy format: count individual events
    let sessionBurstSum = 0;
    let sessionBurstCount = 0;

    for (const evt of events) {
      const t = evt.timestamp as number;
      if (sm.startTime === null || t < sm.startTime) sm.startTime = t;
      if (sm.endTime === null || t > sm.endTime) sm.endTime = t;

      switch (evt.type) {
        case "keystroke":
          sm.keystrokes++;
          break;
        case "typing_burst":
          sm.typingBursts++;
          sm.totalBurstWords += evt.wordsApprox ?? 0;
          sessionBurstSum += evt.burstDurationMs ?? 0;
          sessionBurstCount++;
          break;
        case "paste":
          sm.pasteEvents++;
          sm.pastedChars += evt.textLength ?? 0;
          break;
        case "copy":
          sm.copyEvents++;
          break;
        case "cut":
          sm.cutEvents++;
          break;
        case "canvas_edit":
          sm.canvasEdits++;
          if (evt.changeType === "insert") sm.canvasInsertions++;
          else if (evt.changeType === "delete") sm.canvasDeletions++;
          else if (evt.changeType === "replace") sm.canvasReplace++;
          break;
        case "focus":
          sm.focusCount++;
          break;
        case "blur":
          sm.blurCount++;
          break;
        case "visibility":
          if (evt.state === "hidden") sm.visibilityHidden++;
          break;
      }
    }

    sm.durationMs = sm.startTime && sm.endTime ? sm.endTime - sm.startTime : 0;
    sm.avgBurstDurationMs =
      sessionBurstCount > 0 ? sessionBurstSum / sessionBurstCount : 0;
  }

  return sm;
}

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  if (!(await isTrackingAllowedForThread(threadId))) {
    return NextResponse.json({
      ...EMPTY_METRICS,
      threadId,
      trackingDisabled: true,
    });
  }

  try {
    const threadDir = join(DATA_DIR, threadId);
    let files: string[];
    try {
      files = await readdir(threadDir);
    } catch {
      return NextResponse.json({
        ...EMPTY_METRICS,
        threadId,
      } satisfies AggregatedMetrics);
    }

    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    const sessions: SessionMetrics[] = [];
    let burstDurationSum = 0;
    let burstCount = 0;

    for (const file of jsonlFiles) {
      const sessionId = file.replace(".jsonl", "");
      const content = await readFile(join(threadDir, file), "utf-8");
      const events = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      const sm = processSessionFile(sessionId, events);
      sessions.push(sm);
      burstDurationSum += sm.avgBurstDurationMs * sm.typingBursts;
      burstCount += sm.typingBursts;
    }

    // Aggregate
    const agg: AggregatedMetrics = {
      threadId,
      sessionCount: sessions.length,
      totalTimeMs: sessions.reduce((s, sm) => s + sm.durationMs, 0),
      firstActivity: sessions.reduce(
        (min, sm) =>
          sm.startTime !== null && (min === null || sm.startTime < min)
            ? sm.startTime
            : min,
        null as number | null
      ),
      lastActivity: sessions.reduce(
        (max, sm) =>
          sm.endTime !== null && (max === null || sm.endTime > max)
            ? sm.endTime
            : max,
        null as number | null
      ),
      totalKeystrokes: sessions.reduce((s, sm) => s + sm.keystrokes, 0),
      totalTypingBursts: sessions.reduce((s, sm) => s + sm.typingBursts, 0),
      totalBurstWords: sessions.reduce((s, sm) => s + sm.totalBurstWords, 0),
      avgBurstDurationMs: burstCount > 0 ? burstDurationSum / burstCount : 0,
      totalPasteEvents: sessions.reduce((s, sm) => s + sm.pasteEvents, 0),
      totalPastedChars: sessions.reduce((s, sm) => s + sm.pastedChars, 0),
      totalCopyEvents: sessions.reduce((s, sm) => s + sm.copyEvents, 0),
      totalCutEvents: sessions.reduce((s, sm) => s + sm.cutEvents, 0),
      totalCanvasEdits: sessions.reduce((s, sm) => s + sm.canvasEdits, 0),
      totalCanvasInsertions: sessions.reduce(
        (s, sm) => s + sm.canvasInsertions,
        0
      ),
      totalCanvasDeletions: sessions.reduce(
        (s, sm) => s + sm.canvasDeletions,
        0
      ),
      totalCanvasReplace: sessions.reduce((s, sm) => s + sm.canvasReplace, 0),
      totalFocus: sessions.reduce((s, sm) => s + sm.focusCount, 0),
      totalBlur: sessions.reduce((s, sm) => s + sm.blurCount, 0),
      totalVisibilityHidden: sessions.reduce(
        (s, sm) => s + sm.visibilityHidden,
        0
      ),
      sessions,
    };

    return NextResponse.json(agg);
  } catch (error) {
    console.error("Failed to aggregate tracking metrics:", error);
    return NextResponse.json(
      { error: "Failed to aggregate metrics" },
      { status: 500 }
    );
  }
}
