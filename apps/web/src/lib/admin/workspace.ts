import type { User } from "@supabase/supabase-js";
import type { WorkspaceManifest } from "@/lib/workspace/types";
import { createAdminStoreClient } from "./store-reader";

function manifestItemCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const items = (value as Partial<WorkspaceManifest>).items;
  return items && typeof items === "object" ? Object.keys(items).length : 0;
}

export async function listAllWorkspaceItemCounts(
  users: Pick<User, "id">[]
): Promise<Record<string, number>> {
  const client = createAdminStoreClient();
  const entries = await Promise.all(
    users.map(async (user) => {
      const item = await client.store.getItem(
        ["workspace_items", user.id],
        "manifest"
      );
      return [user.id, manifestItemCount(item?.value)] as const;
    })
  );
  return Object.fromEntries(entries);
}
