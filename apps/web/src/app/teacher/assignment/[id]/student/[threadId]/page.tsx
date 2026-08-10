"use client";

import { Suspense } from "react";
import { UserProvider } from "@/contexts/UserContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { TeacherSubmissionView } from "@/components/teaching/teacher-submission-view";
import { TeacherNestedWorkspaceShell } from "@/components/teaching/teacher-workspace-shell";

interface SubmissionPageProps {
  params: { id: string; threadId: string };
}

export default function SubmissionPage({ params }: SubmissionPageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeacherNestedWorkspaceShell>
            <TeacherSubmissionView
              assignmentId={params.id}
              threadId={params.threadId}
            />
          </TeacherNestedWorkspaceShell>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
