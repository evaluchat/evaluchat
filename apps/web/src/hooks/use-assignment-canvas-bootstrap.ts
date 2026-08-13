"use client";

import { useTeachingAssignmentOptional } from "@/contexts/TeachingAssignmentContext";
import { useGraphContext } from "@/contexts/GraphContext";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { ArtifactV3 } from "@opencanvas/shared/types";
import { useEffect, useRef } from "react";

/**
 * When an assignment is active (route `/student/assignment/[id]` or legacy
 * `?assignment=`), open a fresh canvas workspace with a blank document and
 * assignment-scoped agent instructions (via GraphContext systemPrompt).
 *
 * On resume (?threadId= present), the canvas is restored from the existing
 * thread state via GraphContext's switchSelectedThread, so we skip
 * reinitialisation.
 */
export function useAssignmentCanvasBootstrap() {
  const assignmentContext = useTeachingAssignmentOptional();
  const assignment = assignmentContext?.assignment;
  const { graphData } = useGraphContext();
  const { setThreadId, threadId } = useThreadContext();
  const bootstrappedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!assignment) {
      bootstrappedIdRef.current = null;
      return;
    }

    // If a threadId is present in the URL this is a resume.
    // The existing thread will be loaded by GraphContext via
    // switchSelectedThread, which restores artifact + messages.
    // We must NOT clear state or reinitialise with empty starter markdown.
    if (threadId) {
      bootstrappedIdRef.current = assignment.id;
      graphData.setChatStarted(true);
      return;
    }

    // Bootstraps once per assignment.id — effect dependencies handle dedup.
    bootstrappedIdRef.current = assignment.id;

    graphData.clearState();
    void setThreadId(null);

    const artifactContent = {
      index: 1,
      type: "text" as const,
      title: assignment.title,
      fullMarkdown: assignment.starterMarkdown ?? "",
    };
    const newArtifact: ArtifactV3 = {
      currentIndex: 1,
      contents: [artifactContent],
    };

    graphData.setArtifact(newArtifact);
    graphData.setUpdateRenderedArtifactRequired(true);
    graphData.setChatStarted(true);
    // Run once per assignment id; graphData handlers are not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignment.id only
  }, [assignment?.id, threadId]);

  return assignment;
}
