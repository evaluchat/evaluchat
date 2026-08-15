"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export type ByokTestResult = { ok: boolean; message: string };

export type ByokFormState = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ByokSavedSnapshot = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
};

export function buildByokPutBody(form: ByokFormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    enabled: form.enabled,
    base_url: form.baseUrl.trim(),
    model: form.model.trim(),
  };
  const key = form.apiKey.trim();
  if (key) {
    body.api_key = key;
  }
  return body;
}

export function isByokFormDirty(
  form: ByokFormState,
  saved: ByokSavedSnapshot | null
): boolean {
  if (!saved) {
    return (
      form.enabled !== true ||
      form.baseUrl.trim() !== "" ||
      form.model.trim() !== "" ||
      form.apiKey.trim() !== ""
    );
  }
  return (
    form.enabled !== saved.enabled ||
    form.baseUrl.trim() !== saved.baseUrl ||
    form.model.trim() !== saved.model ||
    form.apiKey.trim() !== ""
  );
}

export async function loadByokSettings(
  fetchFn: typeof fetch = fetch
): Promise<ByokSavedSnapshot | null> {
  const res = await fetchFn("/api/byok");
  if (!res.ok) {
    throw new Error("Failed to load BYOK settings");
  }
  const data = (await res.json()) as {
    settings: {
      enabled: boolean;
      base_url: string;
      model: string;
      api_key_masked: string;
    } | null;
  };
  if (!data.settings) return null;
  return {
    enabled: data.settings.enabled,
    baseUrl: data.settings.base_url,
    model: data.settings.model,
    apiKeyMasked: data.settings.api_key_masked,
  };
}

export async function saveByokSettings(
  form: ByokFormState,
  fetchFn: typeof fetch = fetch
): Promise<ByokSavedSnapshot> {
  const res = await fetchFn("/api/byok", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildByokPutBody(form)),
  });
  const data = (await res.json()) as {
    settings?: {
      enabled: boolean;
      base_url: string;
      model: string;
      api_key_masked: string;
    };
    error?: string;
  };
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to save");
  }
  return {
    enabled: data.settings.enabled,
    baseUrl: data.settings.base_url,
    model: data.settings.model,
    apiKeyMasked: data.settings.api_key_masked,
  };
}

export async function testByokConnection(
  fetchFn: typeof fetch = fetch
): Promise<ByokTestResult> {
  const res = await fetchFn("/api/byok/test", { method: "POST" });
  const data = (await res.json()) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok && data.error) {
    return { ok: false, message: data.error };
  }
  return {
    ok: Boolean(data.ok),
    message: data.message || data.error || "Unknown result",
  };
}

type ByokSettingsCardViewProps = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  savedMaskedKey: string | null;
  saving: boolean;
  testing: boolean;
  testResult: ByokTestResult | null;
  onEnabledChange: (enabled: boolean) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
};

/** Presentational surface — used by the card and by unit tests. */
export function ByokSettingsCardView({
  enabled,
  baseUrl,
  model,
  apiKey,
  savedMaskedKey,
  saving,
  testing,
  testResult,
  onEnabledChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyChange,
  onSave,
  onTest,
}: ByokSettingsCardViewProps) {
  const testDisabled = savedMaskedKey === null || testing;

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Your own AI provider</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              id="byok-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              data-testid="byok-enabled"
            />
            <Label htmlFor="byok-enabled">Use my provider for AI chat</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-base-url">Base URL</Label>
            <Input
              id="byok-base-url"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              autoComplete="off"
              data-testid="byok-base-url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-model">Model</Label>
            <Input
              id="byok-model"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="openai/gpt-4o-mini"
              autoComplete="off"
              data-testid="byok-model"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="byok-api-key">API key</Label>
            <Input
              id="byok-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                savedMaskedKey
                  ? `Saved key ${savedMaskedKey}`
                  : "Paste your API key"
              }
              autoComplete="off"
              data-testid="byok-api-key"
            />
            {savedMaskedKey ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="byok-masked-key"
              >
                Saved key: {savedMaskedKey}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Your key is encrypted on the server and only used for your own AI
            interactions in evaluchat. Create a dedicated API key with a
            sensible usage limit.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} data-testid="byok-save">
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testDisabled}
              onClick={onTest}
              data-testid="byok-test"
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
          {testResult ? (
            <p
              className={
                testResult.ok
                  ? "text-sm text-green-700"
                  : "text-sm text-red-700"
              }
              data-testid="byok-test-result"
            >
              {testResult.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function ByokSettingsCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState<ByokSavedSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ByokTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadByokSettings();
        if (cancelled || !loaded) return;
        setSaved(loaded);
        setEnabled(loaded.enabled);
        setBaseUrl(loaded.baseUrl);
        setModel(loaded.model);
      } catch {
        if (!cancelled) {
          toast({
            title: "Could not load provider settings",
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const form: ByokFormState = { enabled, baseUrl, model, apiKey };

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    try {
      const next = await saveByokSettings(form);
      setSaved(next);
      setApiKey("");
      setEnabled(next.enabled);
      setBaseUrl(next.baseUrl);
      setModel(next.model);
      toast({ title: "Saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (saved === null) return;
    if (isByokFormDirty(form, saved)) {
      toast({
        title: "Save your settings first",
        description: "Test uses the saved provider configuration.",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testByokConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <ByokSettingsCardView
      enabled={enabled}
      baseUrl={baseUrl}
      model={model}
      apiKey={apiKey}
      savedMaskedKey={saved?.apiKeyMasked ?? null}
      saving={saving}
      testing={testing}
      testResult={testResult}
      onEnabledChange={setEnabled}
      onBaseUrlChange={setBaseUrl}
      onModelChange={setModel}
      onApiKeyChange={setApiKey}
      onSave={handleSave}
      onTest={handleTest}
    />
  );
}
