"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { UserProvider } from "@/contexts/UserContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { TeacherAssignmentDetail } from "@/components/teaching/teacher-assignment-detail";
import { TeacherNestedWorkspaceShell } from "@/components/teaching/teacher-workspace-shell";

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeacherNestedWorkspaceShell>
            <TeacherAssignmentDetail assignmentId={id} />
          </TeacherNestedWorkspaceShell>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
