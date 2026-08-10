"use client";

import { Canvas } from "@/components/canvas";
import { AssistantProvider } from "@/contexts/AssistantContext";
import { GraphProvider } from "@/contexts/GraphContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { UserProvider } from "@/contexts/UserContext";
import { useUserContext } from "@/contexts/UserContext";
import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TeachingAssignmentProvider } from "@/contexts/TeachingAssignmentContext";

// /canvas is an authenticated route. The client-side gate is a
// belt-and-suspenders guard: any signed-in user may use the Canvas workspace.
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

export default function CanvasPage() {
  return (
    <Suspense>
      <UserProvider>
        <ThreadProvider>
          <AssistantProvider>
            <TeachingAssignmentProvider>
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
