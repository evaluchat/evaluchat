"use client";

import { Canvas } from "@/components/canvas";
import { Badge } from "@/components/ui/badge";
import { WorkspaceAssignmentProvider } from "@/contexts/TeachingAssignmentContext";
import { SessionRecorderWrapper } from "@/components/tracking/session-recorder-wrapper";
import type { MethodParticipantWorkspaceItem } from "@/lib/workspace/types";
import { methodParticipantAsAssignment } from "@/lib/workspace/thread-policy";
import { useEffect, useState } from "react";

export function MethodParticipantCanvas({
  item,
}: {
  item: MethodParticipantWorkspaceItem;
}) {
  const [providerLabel, setProviderLabel] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/byok/shared", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return;
        const entries = (await response.json()) as Array<{
          itemId?: string;
          providerLabel?: string;
        }>;
        const entry = entries.find((candidate) => candidate.itemId === item.id);
        if (!cancelled && entry?.providerLabel) {
          setProviderLabel(entry.providerLabel);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <WorkspaceAssignmentProvider
      assignment={methodParticipantAsAssignment(item)}
    >
      <SessionRecorderWrapper>
        <Canvas
          editorBanner={
            providerLabel ? (
              <Badge variant="secondary" data-testid="shared-byok-badge">
                {providerLabel}
              </Badge>
            ) : undefined
          }
        />
      </SessionRecorderWrapper>
    </WorkspaceAssignmentProvider>
  );
}
