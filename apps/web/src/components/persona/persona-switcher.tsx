"use client";

import { useUserContext } from "@/contexts/UserContext";
import { ChevronDown, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type PersonaId = "student" | "teacher" | "researcher";

function currentPersonaId(pathname: string): PersonaId | undefined {
  if (pathname.startsWith("/student")) return "student";
  if (pathname.startsWith("/teacher")) return "teacher";
  if (pathname.startsWith("/researcher")) return "researcher";
  return undefined;
}

interface PersonaOption {
  id: PersonaId;
  label: string;
  description: string;
  path: string;
}

/**
 * Build the list of dashboards the current user may navigate to.
 * Private teaching-role gating is scrubbed from the public surface.
 */
function useAccessiblePersonas(): PersonaOption[] {
  useUserContext();
  return useMemo(() => [], []);
}

export function PersonaSwitcher({ className }: { className?: string }) {
  const { user } = useUserContext();
  const router = useRouter();
  const personas = useAccessiblePersonas();
  const [open, setOpen] = useState(false);

  if (!user || personas.length === 0) return null;

  const full = user.user_metadata?.full_name;
  const name =
    typeof full === "string" && full.trim()
      ? full.trim()
      : user.email
        ? (() => {
            const local = user.email.split("@")[0];
            return local.charAt(0).toUpperCase() + local.slice(1);
          })()
        : "Account";

  const current = currentPersonaId(window.location.pathname) ?? personas[0].id;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        data-testid="persona-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserRound className="h-4 w-4" />
        <span className="max-w-[10rem] truncate">{name}</span>
        <span className="text-white/40">·</span>
        <span className="font-medium capitalize text-[#F08080]">{current}</span>
        <ChevronDown className="h-3.5 w-3.5 text-white/50" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-white/15 bg-[#243548] shadow-xl"
          role="menu"
          data-testid="persona-switcher-menu"
        >
          <div className="border-b border-white/10 px-3 py-2 text-xs text-white/60">
            Switch to a dashboard
          </div>
          {personas.map((persona) => {
            const isActive = persona.id === current;
            return (
              <button
                key={persona.id}
                type="button"
                role="menuitem"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  router.push(persona.path);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/10",
                  isActive && "bg-white/10"
                )}
              >
                <span>
                  <span className="block text-sm font-medium capitalize text-white">
                    {persona.label}
                  </span>
                  <span className="block text-xs text-white/60">
                    {persona.description}
                  </span>
                </span>
                {isActive && (
                  <span className="text-xs text-[#F08080]">current</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
