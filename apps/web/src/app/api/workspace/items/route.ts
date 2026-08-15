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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsedBody =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const methodId =
    typeof parsedBody.methodId === "string" && parsedBody.methodId
      ? parsedBody.methodId
      : undefined;
  const templateId =
    typeof parsedBody.templateId === "string" && parsedBody.templateId
      ? parsedBody.templateId
      : undefined;
  const hasMethodId = methodId !== undefined;
  if (!hasMethodId && templateId === undefined) {
    return NextResponse.json(
      { error: "Unsupported template" },
      { status: 400 }
    );
  }

  try {
    const item = hasMethodId
      ? await createMethodWorkspaceItem(user.id, methodId)
      : await createWorkspaceItem(user.id, templateId!);
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
      { status: 500 }
    );
  }
}
