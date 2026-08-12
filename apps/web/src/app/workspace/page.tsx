"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import { WorkspaceHome } from "@/components/workspace/workspace-home";

function AuthenticatedWorkspaceHome() {
  const { user, loading } = useUserContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  return <WorkspaceHome />;
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <UserProvider>
        <AuthenticatedWorkspaceHome />
      </UserProvider>
    </Suspense>
  );
}
