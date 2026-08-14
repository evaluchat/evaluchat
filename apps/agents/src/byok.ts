import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createClient, Session } from "@supabase/supabase-js";
import { decryptApiKey } from "@opencanvas/shared/byok/crypto";
import type {
  ByokDecryptedSettings,
  UserByokSettingsRow,
} from "@opencanvas/shared/byok/types";

let warnedMissingByokConfig = false;

function warnMissingByokConfigOnce(reason: string) {
  if (warnedMissingByokConfig) return;
  warnedMissingByokConfig = true;
  console.warn(`[byok] ${reason}; falling back to platform providers`);
}

function isSupabaseServiceRoleConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE?.trim();
  return Boolean(
    key && key !== "your-service-role-key" && !key.startsWith("your-")
  );
}

/**
 * Load the signed-in user's BYOK settings when configured and enabled.
 * Returns null when BYOK is unavailable, disabled, or not set — callers
 * should keep using the existing platform provider path.
 */
export async function getByokModelSettings(
  config: LangGraphRunnableConfig
): Promise<ByokDecryptedSettings | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !isSupabaseServiceRoleConfigured()
  ) {
    warnMissingByokConfigOnce(
      "Supabase URL or service role not configured for BYOK"
    );
    return null;
  }

  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    warnMissingByokConfigOnce("BYOK_ENCRYPTION_KEY not configured");
    return null;
  }

  const accessToken = (
    config.configurable?.supabase_session as Session | undefined
  )?.access_token;
  if (!accessToken) {
    return null;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const authRes = await supabase.auth.getUser(accessToken);
  const user = authRes.data.user;
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as UserByokSettingsRow;
  if (!row.enabled) {
    return null;
  }

  try {
    return {
      baseUrl: row.base_url,
      model: row.model,
      apiKey: decryptApiKey(row.api_key_enc, encryptionKey),
    };
  } catch (err) {
    console.warn(
      "[byok] failed to decrypt user API key; falling back to platform providers",
      err
    );
    return null;
  }
}
