import { LANGGRAPH_API_URL } from "@/constants";
import { getCustomAssignmentById } from "./assignment-file-store";
import { getSeedAssignmentById } from "./seed-loader";

/** Resolve tracking policy from the server-owned thread/assignment snapshot. */
export async function isTrackingAllowedForThread(
  threadId: string,
  userId?: string
): Promise<boolean> {
  if (!threadId || threadId === "unknown") return false;
  try {
    const response = await fetch(
      `${LANGGRAPH_API_URL}/threads/${encodeURIComponent(threadId)}`,
      {
        headers: { "x-api-key": process.env.LANGCHAIN_API_KEY || "" },
      }
    );
    if (!response.ok) return false;
    const thread = await response.json();
    const metadataUserId = thread?.metadata?.user_id;
    if (typeof metadataUserId !== "string" || metadataUserId !== userId)
      return false;
    const assignmentId = thread?.metadata?.assignment_id;
    if (typeof assignmentId !== "string") return true;
    const assignment =
      (await getCustomAssignmentById(assignmentId)) ||
      (await getSeedAssignmentById(assignmentId));
    return assignment?.apparatusConfiguration?.tracking !== false;
  } catch {
    // Fail closed for assignment telemetry: a disabled profile must never
    // emit because a policy lookup happened to fail.
    return false;
  }
}
