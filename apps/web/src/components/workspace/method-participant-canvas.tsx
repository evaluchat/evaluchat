"use client";

import { Canvas } from "@/components/canvas";
import { WorkspaceAssignmentProvider } from "@/contexts/TeachingAssignmentContext";
import { SessionRecorderWrapper } from "@/components/tracking/session-recorder-wrapper";
import type { MethodParticipantWorkspaceItem } from "@/lib/workspace/types";
import { methodParticipantAsAssignment } from "@/lib/workspace/thread-policy";

export function MethodParticipantCanvas({
  item,
}: {
  item: MethodParticipantWorkspaceItem;
}) {
  return (
    <WorkspaceAssignmentProvider assignment={methodParticipantAsAssignment(item)}>
      <SessionRecorderWrapper>
        <Canvas />
      </SessionRecorderWrapper>
    </WorkspaceAssignmentProvider>
  );
}
