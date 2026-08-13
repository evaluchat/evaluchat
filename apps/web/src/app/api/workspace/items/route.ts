import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  createMethodWorkspaceItem,
  createWorkspaceItem,
  ensureDefaultWorkspaceItem,
  listWorkspaceItems,
  UnsupportedMethodError,
} from "@/lib/workspace/store";

async function authenticatedUser() {
  const auth = await verifyUserAuthenticated();
  return auth?.user;
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureDefaultWorkspaceItem(user.id);
    return NextResponse.json({
      items: await listWorkspaceItems(user.id, { email: user.email }),
    });
  } catch (error) {
    console.error("[workspace] failed to list items", error);
    return NextResponse.json(
      { error: "Could not load workspace items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    if (typeof body?.methodId === "string" && body.methodId) {
      const item = await createMethodWorkspaceItem(user.id, body.methodId);
      return NextResponse.json({ item }, { status: 201 });
    }
    if (typeof body?.templateId !== "string" || !body.templateId) {
      return NextResponse.json(
        { error: "Unsupported template" },
        { status: 400 }
      );
    }
    const item = await createWorkspaceItem(user.id, body.templateId);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof UnsupportedMethodError) {
      return NextResponse.json(
        { error: "Unsupported method" },
        { status: 400 }
      );
    }
    console.error("[workspace] failed to create item", error);
    return NextResponse.json(
      { error: "Could not create workspace item" },
      { status: 400 }
    );
  }
}
