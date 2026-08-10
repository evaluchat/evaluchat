"use client";

import { StudentAssignmentsLanding } from "@/components/teaching/student-assignments-landing";
import { AssistantProvider } from "@/contexts/AssistantContext";
import { TeachingAssignmentProvider } from "@/contexts/TeachingAssignmentContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { UserProvider } from "@/contexts/UserContext";
import { Suspense } from "react";

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeachingAssignmentProvider>
            <AssistantProvider>
              <StudentAssignmentsLanding />
            </AssistantProvider>
          </TeachingAssignmentProvider>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
