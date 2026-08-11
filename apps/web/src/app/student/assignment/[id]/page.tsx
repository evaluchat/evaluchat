"use client";

import { Canvas } from "@/components/canvas";
import { AssistantProvider } from "@/contexts/AssistantContext";
import { GraphProvider } from "@/contexts/GraphContext";
import { TeachingAssignmentProvider } from "@/contexts/TeachingAssignmentContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { UserProvider } from "@/contexts/UserContext";
import { useUserContext } from "@/contexts/UserContext";
import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// /student paths are middleware-protected; this client gate matches the old
// /canvas AuthGate as a belt-and-suspenders guard.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  return <>{children}</>;
}

export default function StudentAssignmentWorkspacePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <ThreadProvider>
          <AssistantProvider>
            <TeachingAssignmentProvider assignmentId={id}>
              <GraphProvider>
                <AuthGate>
                  <Canvas />
                </AuthGate>
              </GraphProvider>
            </TeachingAssignmentProvider>
          </AssistantProvider>
        </ThreadProvider>
      </UserProvider>
    </Suspense>
  );
}
