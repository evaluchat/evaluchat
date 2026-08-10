import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { isTrackingAllowedForThread } from "@/lib/teaching/tracking-policy";

const DATA_DIR = join(process.cwd(), "data", "tracking");

// GET /api/tracking/sessions?threadId=xxx — list all sessions for a thread
export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  if (!(await isTrackingAllowedForThread(threadId))) {
    return NextResponse.json({ threadId, sessions: [], trackingDisabled: true });
  }

  try {
    const threadDir = join(DATA_DIR, threadId);
    const files = await readdir(threadDir);
    const sessions = files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(".jsonl", ""));

    return NextResponse.json({ threadId, sessions });
  } catch {
    return NextResponse.json({ threadId, sessions: [] });
  }
}

// POST /api/tracking/sessions — get events for a specific session
// Body: { threadId, sessionId }
export async function POST(req: NextRequest) {
  const { threadId, sessionId } = await req.json();

  if (!threadId || !sessionId) {
    return NextResponse.json(
      { error: "threadId and sessionId required" },
      { status: 400 }
    );
  }

  if (!(await isTrackingAllowedForThread(threadId))) {
    return NextResponse.json({ error: "Tracking is disabled for this assignment" }, { status: 404 });
  }

  try {
    const filePath = join(DATA_DIR, threadId, `${sessionId}.jsonl`);
    const content = await readFile(filePath, "utf-8");
    const events = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return NextResponse.json({
      threadId,
      sessionId,
      events,
      count: events.length,
    });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
