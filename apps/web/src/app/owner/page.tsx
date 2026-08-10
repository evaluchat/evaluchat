"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserProvider, useUserContext } from "@/contexts/UserContext";
import { InviteAdminDialog } from "@/components/admin/invite-teacher-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isOwner } from "@/lib/teaching/teacher-utils";

function OwnerPageContent() {
  const router = useRouter();
  const { user, loading } = useUserContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (!isOwner(user)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user || !isOwner(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Owner</h1>
          <Link
            href="/auth/signout"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign out
          </Link>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Invite org admin</h2>
          <p className="text-sm text-muted-foreground">
            Org admins run an organisation workspace, invite teachers, and
            enable reviewed research apparatuses.
          </p>
        </div>
        <InviteAdminDialog />
      </div>
    </div>
  );
}

export default function OwnerPage() {
  return (
    <UserProvider>
      <OwnerPageContent />
    </UserProvider>
  );
}
