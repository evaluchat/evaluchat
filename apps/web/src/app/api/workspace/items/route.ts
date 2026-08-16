import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { createClient } from "@/lib/supabase/server";
import {
  createMethodWorkspaceItem,
  createWorkspaceItem,
  ensureDefaultWorkspaceItem,
  listWorkspaceItems,
  UnsupportedMethodError,
  UnsupportedTemplateError,
} from "@/lib/workspace/store";

async function authenticatedUser() {
  const auth = await verifyUserAuthenticated();
  return auth?.user;
}

async function recordByokShare(userId: string, itemId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("byok_append_share", {
      p_user_id: userId,
      p_item_id: itemId,
    });

    if (error) {
      console.error(
        "[workspace] failed to record BYOK assignment share",
        error
      );
    }
  } catch (error) {
    // The item has already been created; sharing should not turn that into a
    // failed request when BYOK settings are unavailable.
    console.error("[workspace] failed to record BYOK assignment share", error);
  }
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
  const shareByok = parsedBody.shareByok === true;
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
    if (hasMethodId && shareByok) {
      await recordByokShare(user.id, item.id);
    }
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof UnsupportedMethodError) {
      return NextResponse.json(
        { error: "Unsupported method" },
        { status: 400 }
      );
    }
    if (error instanceof UnsupportedTemplateError) {
      return NextResponse.json(
        { error: "Unsupported template" },
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
