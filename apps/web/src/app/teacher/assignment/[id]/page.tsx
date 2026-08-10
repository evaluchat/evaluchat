"use client";

import { Suspense } from "react";
import { UserProvider } from "@/contexts/UserContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { TeacherAssignmentDetail } from "@/components/teaching/teacher-assignment-detail";
import { TeacherNestedWorkspaceShell } from "@/components/teaching/teacher-workspace-shell";

interface AssignmentPageProps {
  params: { id: string };
}

export default function AssignmentDetailPage({ params }: AssignmentPageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeacherNestedWorkspaceShell>
            <TeacherAssignmentDetail assignmentId={params.id} />
          </TeacherNestedWorkspaceShell>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
