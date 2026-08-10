"use client";

import { buildAssignmentSystemPrompt } from "@/lib/teaching/assignment-prompt";
import { getAssignmentByIdIncludingCustom } from "@/lib/teaching/assignment-store";
import { isTeachingPrototype } from "@/lib/teaching/config";
import type { StudentAssignment } from "@/lib/teaching/types";
import {
  CANONICAL_ESSAYS_CONFIGURATION,
  type ApparatusConfiguration,
} from "@opencanvas/shared";
import { useQueryState } from "nuqs";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type TeachingAssignmentContextType = {
  assignment: StudentAssignment | undefined;
  assignmentId: string | null;
  systemPrompt: string | undefined;
  apparatusConfiguration: ApparatusConfiguration | undefined;
  isTeachingMode: boolean;
  simplifiedUI: boolean;
  clearAssignment: () => void;
};

const TeachingAssignmentContext = createContext<
  TeachingAssignmentContextType | undefined
>(undefined);

export function TeachingAssignmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  // == essays apparatus enabled (2A-3) — dev flow unchanged
  const teachingMode = isTeachingPrototype();
  const [assignmentId, setAssignmentId] = useQueryState("assignment");
  const [assignment, setAssignment] = useState<StudentAssignment | undefined>(
    undefined
  );

  useEffect(() => {
    async function loadAssignment() {
      if (!teachingMode || !assignmentId) {
        setAssignment(undefined);
        return;
      }

      try {
        const assignmentData =
          await getAssignmentByIdIncludingCustom(assignmentId);
        setAssignment(assignmentData);
      } catch (error) {
        console.error("Failed to load assignment:", error);
        setAssignment(undefined);
      }
    }

    loadAssignment();
  }, [teachingMode, assignmentId]);

  const systemPrompt = useMemo(
    () =>
      assignment
        ? buildAssignmentSystemPrompt(
            assignment,
            assignment.apparatusConfiguration ?? CANONICAL_ESSAYS_CONFIGURATION
          )
        : undefined,
    [assignment]
  );

  const apparatusConfiguration = assignment?.apparatusConfiguration;

  const clearAssignment = useCallback(() => {
    void setAssignmentId(null);
  }, [setAssignmentId]);

  const value = useMemo(
    () => ({
      assignment,
      assignmentId: assignmentId ?? null,
      systemPrompt,
      apparatusConfiguration,
      isTeachingMode: teachingMode,
      simplifiedUI: teachingMode && !!assignmentId,
      clearAssignment,
    }),
    [
      assignment,
      assignmentId,
      systemPrompt,
      apparatusConfiguration,
      teachingMode,
      clearAssignment,
    ]
  );

  return (
    <TeachingAssignmentContext.Provider value={value}>
      {children}
    </TeachingAssignmentContext.Provider>
  );
}

export function useTeachingAssignment() {
  const ctx = useContext(TeachingAssignmentContext);
  if (ctx === undefined) {
    throw new Error(
      "useTeachingAssignment must be used within TeachingAssignmentProvider"
    );
  }
  return ctx;
}

/** Safe when provider may be absent (non-teaching builds). */
export function useTeachingAssignmentOptional() {
  return useContext(TeachingAssignmentContext);
}
