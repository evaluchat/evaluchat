import { describe, expect, it } from "vitest";
import { formatWorkspaceItemDate } from "./display";

describe("workspace inbox dates", () => {
  const now = new Date("2026-08-12T12:00:00");

  it("shows weekday and time for items received this week", () => {
    expect(formatWorkspaceItemDate("2026-08-10T15:30:00", now)).toMatch(
      /^Mon 15:30$/
    );
  });

  it("shows weekday and day/month for older items this month", () => {
    expect(formatWorkspaceItemDate("2026-08-06T09:00:00", now)).toMatch(
      /^Thu 6\/8$/
    );
  });

  it("shows a padded year/month/day for earlier months", () => {
    expect(formatWorkspaceItemDate("2026-06-23T09:00:00", now)).toBe(
      "2026/06/23"
    );
  });
});
