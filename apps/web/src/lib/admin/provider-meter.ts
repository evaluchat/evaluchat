import { createAdminClient } from "@/lib/teaching/admin-client";
import { appendProviderUsageEvent } from "@/lib/workspace/usage-store";

export function isProviderRunRequest(method: string, path: string): boolean {
  return method === "POST" && /^threads\/[^/]+\/runs(?:\/stream)?$/.test(path);
}

async function hasEnabledByokOverride(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("user_byok_settings")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error(
        "Failed to check BYOK settings before usage metering",
        error
      );
      return false;
    }
    return data?.enabled === true;
  } catch (error) {
    console.error("Failed to check BYOK settings before usage metering", error);
    return false;
  }
}

/** Record one successful platform-provider run; BYOK traffic is excluded. */
export async function recordPlatformProviderRun(
  userId: string,
  method: string,
  path: string,
  status: number
): Promise<void> {
  if (status >= 400 || !isProviderRunRequest(method, path)) return;
  if (await hasEnabledByokOverride(userId)) return;

  try {
    await appendProviderUsageEvent(userId);
  } catch (error) {
    // Metering must not turn a successful agent run into a failed user request.
    console.error("Failed to append provider usage event", error);
  }
}
