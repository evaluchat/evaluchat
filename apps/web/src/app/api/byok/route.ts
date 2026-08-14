import { NextRequest, NextResponse } from "next/server";
import {
  encryptApiKey,
  maskApiKey,
  decryptApiKey,
} from "@opencanvas/shared/byok/crypto";
import type { UserByokSettingsRow } from "@opencanvas/shared/byok/types";
import { createClient } from "@/lib/supabase/server";

function getEncryptionKey(): string | null {
  const key = process.env.BYOK_ENCRYPTION_KEY?.trim();
  return key || null;
}

function maskedSettingsResponse(row: UserByokSettingsRow) {
  let masked = "••••••••";
  const encryptionKey = getEncryptionKey();
  if (encryptionKey) {
    try {
      masked = maskApiKey(decryptApiKey(row.api_key_enc, encryptionKey));
    } catch {
      masked = "••••••••";
    }
  }
  return {
    enabled: row.enabled,
    base_url: row.base_url,
    model: row.model,
    api_key_masked: masked,
  };
}

function validateBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load BYOK settings" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({
    settings: maskedSettingsResponse(data as UserByokSettingsRow),
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "BYOK_ENCRYPTION_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  let body: {
    enabled?: boolean;
    base_url?: string;
    model?: string;
    api_key?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingRow = (existing as UserByokSettingsRow | null) ?? null;

  const baseUrlRaw =
    typeof body.base_url === "string"
      ? body.base_url
      : (existingRow?.base_url ?? "");
  const baseUrl = validateBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "base_url must be a valid http(s) URL" },
      { status: 400 }
    );
  }

  const modelRaw =
    typeof body.model === "string" ? body.model : (existingRow?.model ?? "");
  const model = modelRaw.trim();
  if (!model) {
    return NextResponse.json(
      { error: "model must be a non-empty string" },
      { status: 400 }
    );
  }

  const enabled =
    typeof body.enabled === "boolean"
      ? body.enabled
      : (existingRow?.enabled ?? true);

  let apiKeyEnc = existingRow?.api_key_enc;
  const incomingKey =
    typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (incomingKey) {
    try {
      apiKeyEnc = encryptApiKey(incomingKey, encryptionKey);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to encrypt API key",
        },
        { status: 500 }
      );
    }
  }

  if (!apiKeyEnc) {
    return NextResponse.json(
      { error: "api_key is required when saving for the first time" },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    base_url: baseUrl,
    model,
    api_key_enc: apiKeyEnc,
    enabled,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_byok_settings")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to save BYOK settings" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    settings: maskedSettingsResponse(data as UserByokSettingsRow),
  });
}
