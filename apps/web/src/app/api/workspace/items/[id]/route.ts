import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  deleteWorkspaceItem,
  getWorkspaceItem,
  reconcileWorkspaceItemThread,
  WorkspaceItemNotFoundError,
  WorkspaceThreadOwnershipError,
} from "@/lib/workspace/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const item = await getWorkspaceItem(auth.user.id, id);
  if (!item)
    return NextResponse.json(
      { error: "Workspace item not found" },
      { status: 404 }
    );
  return NextResponse.json({ item });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const existing = await getWorkspaceItem(auth.user.id, id);
  if (!existing)
    return NextResponse.json(
      { error: "Workspace item not found" },
      { status: 404 }
    );

  try {
    const body = await request.json();
    if (body?.threadId !== null && typeof body?.threadId !== "string") {
      return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }
    const item = await reconcileWorkspaceItemThread(
      auth.user.id,
      id,
      body.threadId ?? null
    );
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[workspace] failed to reconcile thread", error);
    return NextResponse.json(
      { error: "Could not attach workspace thread" },
      { status: 403 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  try {
    await deleteWorkspaceItem(auth.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Workspace item not found" },
        { status: 404 }
      );
    }
    if (error instanceof WorkspaceThreadOwnershipError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[workspace] failed to delete item", error);
    return NextResponse.json(
      { error: "Could not delete workspace item" },
      { status: 500 }
    );
  }
}
