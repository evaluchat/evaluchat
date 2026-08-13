import type { WorkspaceItem } from "./types";

/**
 * Format workspace receipt dates like the assignment inbox:
 * - this week: weekday + local time (`Mon 15:30`)
 * - this month: weekday + day/month (`Thu 6/8`)
 * - older: ISO-like calendar date (`2026/06/23`)
 */
export function formatWorkspaceItemDate(
  value: string,
  now: Date = new Date()
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const startOfWeek = new Date(now);
  const dayOfWeek = startOfWeek.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);

  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

  if (date >= startOfWeek && date < startOfNextWeek) {
    const weekday = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
    }).format(date);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    return `${weekday} ${time}`;
  }

  if (sameMonth) {
    const weekday = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
    }).format(date);
    return `${weekday} ${date.getDate()}/${date.getMonth() + 1}`;
  }

  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0")
    )
    .join("/");
}

export function workspaceItemHref(item: WorkspaceItem): string {
  const params = new URLSearchParams();
  if (item.threadId) params.set("threadId", item.threadId);
  if (
    item.kind === "method_participant" &&
    item.submission?.status === "submitted"
  ) {
    params.set("readonly", "1");
  }
  const query = params.toString();
  return `/workspace/items/${item.id}${query ? `?${query}` : ""}`;
}

export function methodParticipantOpenHref(
  runItemId: string,
  participant: {
    userId?: string;
    itemId?: string;
    threadId?: string;
    submissionStatus: string;
  },
  currentUserId?: string
): string | undefined {
  if (!participant.itemId) return undefined;
  if (participant.userId === currentUserId) {
    const params = new URLSearchParams();
    if (participant.threadId) params.set("threadId", participant.threadId);
    if (participant.submissionStatus === "submitted") {
      params.set("readonly", "1");
    }
    const query = params.toString();
    return `/workspace/items/${participant.itemId}${query ? `?${query}` : ""}`;
  }
  return `/workspace/items/${runItemId}/review/${participant.itemId}`;
}

export function ownParticipantItemId(
  item: WorkspaceItem,
  userId?: string
): string | undefined {
  if (!userId || item.kind !== "method" || !item.run) return undefined;
  return item.run.participants.find(
    (participant) => participant.userId === userId
  )?.itemId;
}

export function workspaceItemTitle(item: WorkspaceItem): string {
  if (item.kind === "method_participant") return item.assignment.title;
  if (item.kind === "method" && item.run) return item.run.assignment.title;
  if (item.kind === "method") {
    return item.methodSource.title || item.templateSnapshot.title;
  }
  return item.templateSnapshot.title;
}

export function workspaceItemDescription(item: WorkspaceItem): string {
  if (item.kind === "method_participant") return item.assignment.prompt;
  if (item.kind === "method" && item.run) {
    return item.methodSource.title || item.run.methodId;
  }
  if (item.kind === "method") {
    return item.methodSource.description || item.templateSnapshot.description;
  }
  return item.templateSnapshot.description;
}

export function workspaceItemKicker(item: WorkspaceItem): string | undefined {
  if (item.kind === "method" && !item.run) return "METHOD DRAFT";
  if (item.kind === "method" && item.run) {
    const invited = item.run.participants.length;
    const submitted = item.run.participants.filter(
      (participant) => participant.submissionStatus === "submitted"
    ).length;
    return `ASSIGNMENT RUN · ${invited} invited · ${submitted} submitted`;
  }
  if (item.kind === "method_participant") {
    return item.submission?.status === "submitted"
      ? "ASSIGNMENT · SUBMITTED"
      : "ASSIGNMENT";
  }
  if (item.kind === "form_template") {
    return item.submission?.status === "submitted" ? "Submitted" : "Draft";
  }
  return undefined;
}

export type WorkspaceItemType = {
  label: string;
  colorClass: string;
  iconClass: string;
};

export function workspaceItemType(item: WorkspaceItem): WorkspaceItemType {
  switch (item.kind) {
    case "form_template":
      return {
        label: "Form template",
        colorClass: "border-amber-200 bg-amber-50 text-amber-700",
        iconClass: "text-amber-600",
      };
    case "method":
      return {
        label: item.run ? "Assignment run" : "Method draft",
        colorClass: "border-violet-200 bg-violet-50 text-violet-700",
        iconClass: "text-violet-600",
      };
    case "method_participant":
      return {
        label: "Assignment",
        colorClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        iconClass: "text-emerald-600",
      };
    case "markdown_template":
    default:
      return {
        label: "Markdown template",
        colorClass: "border-sky-200 bg-sky-50 text-sky-700",
        iconClass: "text-sky-600",
      };
  }
}
