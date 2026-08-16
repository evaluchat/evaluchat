"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { WorkspaceItem } from "@/lib/workspace/types";
import type { ByokShareMode } from "@opencanvas/shared/byok/types";

export type CatalogResult = {
  id: string;
  title: string;
  description: string;
  kind: "template" | "method";
  templateKind?: "markdown" | "form";
  disabled?: boolean;
  status?: string;
};

export type ByokDialogSettings = {
  enabled: boolean;
  shareMode: ByokShareMode;
};

export function buildWorkspaceItemCreateBody(
  result: Pick<CatalogResult, "id" | "kind">,
  shareByok: boolean
): Record<string, unknown> {
  if (result.kind === "method") {
    return {
      kind: "method",
      methodId: result.id,
      ...(shareByok ? { shareByok: true } : {}),
    };
  }
  return { kind: "template", templateId: result.id };
}

export function MethodByokShareControl({
  settings,
  loading,
  checked,
  onCheckedChange,
}: {
  settings: ByokDialogSettings | null;
  loading: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  if (loading) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="byok-share-loading"
      >
        Loading provider settings…
      </p>
    );
  }

  if (settings?.enabled && settings.shareMode === "all_assignments") {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="byok-share-all-note"
      >
        Your provider is shared with all assignments — participants will use it.
      </p>
    );
  }

  const disabled = !settings?.enabled;
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          data-testid="share-byok"
        />
        <span>Share my BYOK provider with participants</span>
      </label>
      <p className="pl-6 text-xs text-muted-foreground">
        {disabled
          ? "Configure a provider in workspace settings first"
          : "Levels the playing field — all participants use your provider for this assignment"}
      </p>
    </div>
  );
}

export function CreateWorkspaceItemDialog({
  onCreated,
}: {
  onCreated: (item: WorkspaceItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"template" | "method">("template");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shareByok, setShareByok] = useState(false);
  const [byokSettings, setByokSettings] = useState<ByokDialogSettings | null>(
    null
  );
  const [byokLoading, setByokLoading] = useState(false);
  const [byokLoadedForMethod, setByokLoadedForMethod] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setResults([]);
    fetch(
      `/api/workspace/catalog?kind=${kind}&q=${encodeURIComponent(query)}`,
      { credentials: "include" }
    )
      .then((response) => response.json())
      .then(
        (body: { kind: "template" | "method"; results?: CatalogResult[] }) => {
          if (!cancelled) {
            setResults(
              (body.results || []).map((result) => ({
                ...result,
                kind: body.kind,
              }))
            );
          }
        }
      )
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, query]);

  useEffect(() => {
    if (!open || kind !== "method" || byokLoadedForMethod) return;
    let cancelled = false;
    setByokLoading(true);
    fetch("/api/byok", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load provider settings");
        return (await response.json()) as {
          settings?: { enabled: boolean; share_mode?: ByokShareMode } | null;
        };
      })
      .then((body) => {
        if (cancelled) return;
        setByokSettings(
          body.settings
            ? {
                enabled: body.settings.enabled,
                shareMode: body.settings.share_mode ?? "none",
              }
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setByokSettings(null);
      })
      .finally(() => {
        if (!cancelled) {
          setByokLoading(false);
          setByokLoadedForMethod(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, byokLoadedForMethod]);

  async function create(result: CatalogResult) {
    setCreating(true);
    try {
      const response = await fetch("/api/workspace/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildWorkspaceItemCreateBody(result, shareByok)),
      });
      if (!response.ok) throw new Error("Could not create workspace item");
      const body = (await response.json()) as { item: WorkspaceItem };
      onCreated(body.item);
      handleOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        title: "Could not create workspace item",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setKind("template");
      setQuery("");
      setShareByok(false);
      setByokSettings(null);
      setByokLoading(false);
      setByokLoadedForMethod(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create workspace item</DialogTitle>
          <DialogDescription>
            Search reviewed templates and methods. Markdown templates are
            editable. Method run briefs are not listed here; choose Methods to
            start an assignment.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates or methods"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          {(["template", "method"] as const).map((option) => (
            <Button
              key={option}
              variant={kind === option ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setKind(option);
                setShareByok(false);
                if (option === "template") {
                  setByokSettings(null);
                  setByokLoadedForMethod(false);
                }
              }}
            >
              {option === "template" ? "Templates" : "Methods"}
            </Button>
          ))}
        </div>
        {kind === "method" ? (
          <MethodByokShareControl
            settings={byokSettings}
            loading={byokLoading}
            checked={shareByok}
            onCheckedChange={setShareByok}
          />
        ) : null}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </p>
          )}
          {!loading &&
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                disabled={result.disabled || creating}
                onClick={() => void create(result)}
                className="w-full rounded-lg border p-4 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{result.title}</span>
                  {result.status && (
                    <span className="text-xs text-muted-foreground">
                      {result.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.description}
                </p>
                {result.kind === "template" &&
                  result.templateKind === "form" && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Protected form · Submit to lock
                    </p>
                  )}
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
