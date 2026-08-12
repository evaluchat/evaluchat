import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import {
  createWorkspaceItem,
  ensureDefaultWorkspaceItem,
  listWorkspaceItems,
} from "@/lib/workspace/store";

async function authenticatedUser() {
  const auth = await verifyUserAuthenticated();
  return auth?.user;
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultWorkspaceItem(user.id);
  return NextResponse.json({ items: await listWorkspaceItems(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    if (body?.templateId !== "evaluchat-getting-started") {
      return NextResponse.json(
        { error: "Unsupported template" },
        { status: 400 }
      );
    }
    const item = await createWorkspaceItem(user.id, body.templateId);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[workspace] failed to create item", error);
    return NextResponse.json(
      { error: "Could not create workspace item" },
      { status: 400 }
    );
  }
}
