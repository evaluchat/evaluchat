"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AssistantProvider } from "@/contexts/AssistantContext";
import { GraphProvider } from "@/contexts/GraphContext";
import { ThreadProvider } from "@/contexts/ThreadProvider";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import {
  WorkspaceItemProvider,
  useWorkspaceItem,
} from "@/contexts/WorkspaceItemContext";
import { WorkspaceCanvas } from "@/components/workspace/workspace-canvas";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUserContext();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);
  if (loading || !user) return null;
  return <>{children}</>;
}

function WorkspaceItemRoute() {
  const { item, loading } = useWorkspaceItem();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !item) router.replace("/workspace");
  }, [loading, item, router]);

  return <AuthGate>{item ? <WorkspaceCanvas /> : null}</AuthGate>;
}

export default function WorkspaceItemPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <WorkspaceItemProvider itemId={id}>
          <ThreadProvider workspaceItemId={id}>
            <AssistantProvider workspaceMode>
              <GraphProvider>
                <WorkspaceItemRoute />
              </GraphProvider>
            </AssistantProvider>
          </ThreadProvider>
        </WorkspaceItemProvider>
      </UserProvider>
    </Suspense>
  );
}
