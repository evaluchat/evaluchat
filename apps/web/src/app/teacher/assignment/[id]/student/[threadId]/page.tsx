"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { UserProvider } from "@/contexts/UserContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { TeacherSubmissionView } from "@/components/teaching/teacher-submission-view";
import { TeacherNestedWorkspaceShell } from "@/components/teaching/teacher-workspace-shell";

export default function SubmissionPage() {
  const { id, threadId } = useParams<{ id: string; threadId: string }>();

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeacherNestedWorkspaceShell>
            <TeacherSubmissionView assignmentId={id} threadId={threadId} />
          </TeacherNestedWorkspaceShell>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
