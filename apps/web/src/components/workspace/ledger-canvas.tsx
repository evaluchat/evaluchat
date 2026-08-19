"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LedgerConfig } from "@opencanvas/shared";
import type {
  EvidenceLedgerBucket,
  EvidenceLedgerDimension,
  EvidenceLedgerTemplate,
} from "@/lib/apparatuses/evidence-ledger";
import type { LedgerWorkspaceItem } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Preview = {
  buckets: Record<EvidenceLedgerBucket, number>;
  baselineCount: number;
  predicate: string;
  template: EvidenceLedgerTemplate;
};

function keyFor(config: LedgerConfig): string {
  return JSON.stringify({
    ...config,
    filters: [...config.filters].sort((a, b) =>
      a.fieldId.localeCompare(b.fieldId)
    ),
  });
}

function filterFor(config: LedgerConfig, fieldId: string) {
  return config.filters.find((filter) => filter.fieldId === fieldId);
}

function withFilter(
  config: LedgerConfig,
  fieldId: string,
  next: LedgerConfig["filters"][number] | undefined
): LedgerConfig {
  const filters = config.filters.filter((filter) => filter.fieldId !== fieldId);
  return { ...config, filters: next ? [...filters, next] : filters };
}

export function LedgerCanvas({ item }: { item: LedgerWorkspaceItem }) {
  const router = useRouter();
  const [config, setConfig] = useState<LedgerConfig>(item.ledgerConfig);
  const [preview, setPreview] = useState<Preview>();
  const [previewKey, setPreviewKey] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string>();
  const configKey = useMemo(() => keyFor(config), [config]);

  async function refresh(configToPreview = config) {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ config: configToPreview }),
        }
      );
      if (!response.ok) throw new Error("Could not preview ledger");
      const result = (await response.json()) as Preview;
      setPreview(result);
      setPreviewKey(keyFor(configToPreview));
    } catch {
      setPreview(undefined);
      setPreviewKey(undefined);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(item.ledgerConfig);
    // An initial server preview supplies both baseline and template metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const dimensions = preview?.template.dimensions || [];
  const groups = [
    ["Context", dimensions.filter((dimension) => dimension.role === "context")],
    [
      "Collection",
      dimensions.filter((dimension) => dimension.role === "collection"),
    ],
    ["Method", dimensions.filter((dimension) => dimension.role === "method")],
  ] as const;
  const previewCurrent = previewKey === configKey;

  async function generate() {
    setGenerating(true);
    setGenerateError(undefined);
    try {
      const response = await fetch(
        `/api/workspace/items/${encodeURIComponent(item.id)}/ledger/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ config }),
        }
      );
      if (!response.ok) throw new Error("Could not generate ledger");
      const result = (await response.json()) as { item: { id: string } };
      router.push(`/workspace/items/${encodeURIComponent(result.item.id)}`);
    } catch (error) {
      // Surface the failure instead of silently re-enabling the button.
      setGenerateError(
        error instanceof Error && error.message
          ? error.message
          : "Ledger generation failed. Try again."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main
      className="mx-auto max-w-4xl space-y-6 p-6"
      data-testid="ledger-canvas"
    >
      <section className="rounded-lg border bg-card p-5">
        <h1 className="text-lg font-semibold">Selected Method version</h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Method</dt>
            <dd>{item.source.methodTitle || item.source.methodId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Method ID / version</dt>
            <dd>
              {item.source.methodId}@{item.source.methodVersion}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Evidence template</dt>
            <dd>
              {item.source.templateId}@{item.source.templateVersion}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Accepted evidence</dt>
            <dd>
              {preview?.baselineCount ??
                item.source.baselineAcceptedEvidenceCount ??
                "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">
          All accepted evidence for this Method version
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Baseline:{" "}
          {preview?.baselineCount ??
            item.source.baselineAcceptedEvidenceCount ??
            "—"}
          . The ledger starts from all accepted evidence for this exact Method
          version.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">Filter by declared facts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only template-declared factual dimensions can narrow the scope.
        </p>
        {groups.map(
          ([name, group]) =>
            group.length > 0 && (
              <fieldset key={name} className="mt-5 space-y-4">
                <legend className="text-sm font-medium">{name}</legend>
                {group.map((dimension) => (
                  <LedgerFilter
                    key={dimension.id}
                    dimension={dimension}
                    filter={filterFor(config, dimension.id)}
                    onChange={(next) =>
                      setConfig((current) =>
                        withFilter(current, dimension.id, next)
                      )
                    }
                  />
                ))}
              </fieldset>
            )
        )}
        {dimensions.length === 0 && !loading && (
          <p className="mt-4 text-sm text-muted-foreground">
            This template declares no ledger dimensions.
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Scope preview</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh preview
          </Button>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Calculating scope on the server…
          </p>
        ) : preview ? (
          <>
            {!previewCurrent && (
              <p className="mt-3 text-sm font-medium text-amber-700">
                Preview out of date
              </p>
            )}
            <table className="mt-3 w-full text-sm">
              <tbody>
                {(
                  Object.entries(preview.buckets) as Array<
                    [EvidenceLedgerBucket, number]
                  >
                ).map(([bucket, count]) => (
                  <tr key={bucket} className="border-t">
                    <th className="py-2 text-left font-medium">{bucket}</th>
                    <td className="py-2 text-right tabular-nums">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 break-words font-mono text-xs text-muted-foreground">
              {preview.predicate}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-destructive">
            Preview unavailable. Refresh after checking your connection.
          </p>
        )}
      </section>

      <Button
        data-testid="generate-ledger"
        onClick={() => void generate()}
        disabled={!previewCurrent || loading || generating}
      >
        {generating ? "Generating…" : "Generate ledger"}
      </Button>
      {generateError && (
        <p
          role="alert"
          className="mt-3 text-sm text-destructive"
          data-testid="generate-error"
        >
          {generateError}
        </p>
      )}
    </main>
  );
}

export function LedgerFilter({
  dimension,
  filter,
  onChange,
}: {
  dimension: EvidenceLedgerDimension;
  filter: LedgerConfig["filters"][number] | undefined;
  onChange: (filter: LedgerConfig["filters"][number] | undefined) => void;
}) {
  if (dimension.control === "multi-select") {
    const values = filter?.control === "multi-select" ? filter.values : [];
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{dimension.id}</span>
        <select
          aria-label={dimension.id}
          multiple
          value={values}
          onChange={(event) => {
            const next = Array.from(
              event.currentTarget.selectedOptions,
              (option) => option.value
            );
            onChange(
              next.length
                ? {
                    fieldId: dimension.id,
                    control: "multi-select",
                    values: next,
                  }
                : undefined
            );
          }}
          className="min-h-24 w-full rounded-md border bg-background p-2"
        >
          {dimension.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const range = filter?.control === "range" ? filter : undefined;
  const inputType = dimension.type === "date" ? "date" : "number";
  function change(endpoint: "min" | "max", value: string) {
    const parsed =
      inputType === "number" && value !== ""
        ? Number(value)
        : value || undefined;
    const next = {
      fieldId: dimension.id,
      control: "range" as const,
      min: range?.min,
      max: range?.max,
      [endpoint]: parsed,
    };
    onChange(
      next.min === undefined && next.max === undefined ? undefined : next
    );
  }
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <span className="sm:col-span-2 font-medium">{dimension.id}</span>
      <label>
        Minimum
        <Input
          aria-label={`${dimension.id} minimum`}
          type={inputType}
          value={range?.min ?? ""}
          onChange={(event) => change("min", event.currentTarget.value)}
        />
      </label>
      <label>
        Maximum
        <Input
          aria-label={`${dimension.id} maximum`}
          type={inputType}
          value={range?.max ?? ""}
          onChange={(event) => change("max", event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
