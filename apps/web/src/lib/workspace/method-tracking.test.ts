import { describe, expect, it } from "vitest";
import { aggregateTrackingMetrics } from "./method-tracking";

describe("aggregateTrackingMetrics", () => {
  it("sums session summaries for a thread", () => {
    const metrics = aggregateTrackingMetrics("thread-1", [
      { type: "session_summary", keystrokes: 10, pasteEvents: 1 },
      { type: "session_summary", keystrokes: 5, pasteEvents: 2 },
      { type: "keystroke" },
    ]);
    expect(metrics).toMatchObject({
      threadId: "thread-1",
      sessionCount: 2,
      totalKeystrokes: 15,
      totalPasteEvents: 3,
    });
  });
});
