"use client";

import { Suspense } from "react";
import { UserProvider } from "@/contexts/UserContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { TeacherLandingPage } from "@/components/teaching/teacher-landing-page";

export default function TeacherPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <TeacherLandingPage />
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
