"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceItemDialog } from "./create-workspace-item-dialog";
import type { WorkspaceItem } from "@/lib/workspace/types";

export function WorkspaceHome() {
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspace/items", { credentials: "include" })
      .then((response) => response.json())
      .then((body: { items?: WorkspaceItem[] }) => setItems(body.items || []))
      .catch((error) => console.error("Failed to load workspace", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/workspace"
            className="text-lg font-semibold tracking-tight"
          >
            Evaluchat
          </Link>
          <div className="flex items-center gap-2">
            <CreateWorkspaceItemDialog
              onCreated={(item) => setItems((current) => [item, ...current])}
            />
            <Link href="/auth/signout" aria-label="Sign out">
              <Button variant="ghost" size="icon">
                <LogOut className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Your workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Start with a question. Make something useful.
          </h1>
          <p className="mt-3 text-slate-600">
            Each item is private to you. Open a guide, ask for help, or replace
            the template with your own Markdown.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex min-h-56 flex-col justify-between rounded-xl border bg-white p-5 shadow-sm"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.templateSnapshot.title.toUpperCase()}
                  </p>
                  <h2 className="mt-4 text-xl font-medium text-slate-900">
                    {item.templateSnapshot.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.templateSnapshot.description}
                  </p>
                </div>
                <Link href={`/workspace/items/${item.id}`}>
                  <Button
                    variant="outline"
                    className="mt-6 w-full justify-between"
                  >
                    Open guide
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
