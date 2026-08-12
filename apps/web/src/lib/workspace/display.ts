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
        label: "Method",
        colorClass: "border-violet-200 bg-violet-50 text-violet-700",
        iconClass: "text-violet-600",
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
