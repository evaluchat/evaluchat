import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { isTrackingAllowedForThread } from "@/lib/teaching/tracking-policy";

const DATA_DIR = join(process.cwd(), "data", "tracking");

export async function POST(req: NextRequest) {
  try {
    const { events } = await req.json();

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "No events provided" },
        { status: 400 }
      );
    }

    // Extract thread_id and session_id from first event
    const firstEvent = events[0];
    const threadId = firstEvent.threadId || "unknown";
    const sessionId = firstEvent.sessionId || "unknown";

    if (!(await isTrackingAllowedForThread(threadId))) {
      return NextResponse.json({ ok: true, count: 0, trackingDisabled: true });
    }

    // Create directory structure: data/tracking/<thread_id>/
    const threadDir = join(DATA_DIR, threadId);
    await mkdir(threadDir, { recursive: true });

    // Append events to JSONL file: data/tracking/<thread_id>/<session_id>.jsonl
    const filePath = join(threadDir, `${sessionId}.jsonl`);
    const lines = events.map((e: any) => JSON.stringify(e)).join("\n") + "\n";

    await writeFile(filePath, lines, { flag: "a" }); // append mode

    return NextResponse.json({ ok: true, count: events.length });
  } catch (err) {
    console.error("[tracking] Failed to store events:", err);
    return NextResponse.json(
      { error: "Failed to store events" },
      { status: 500 }
    );
  }
}
