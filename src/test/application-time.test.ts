import { describe, expect, it } from "vitest";
import { formatApplicationDateTime, parseApplicationDateTime } from "@/lib/applicationTime";

describe("application time", () => {
  it("interprets database date-times as UTC+8 application time", () => {
    expect(parseApplicationDateTime("2026-09-13 17:30:45")?.toISOString()).toBe("2026-09-13T09:30:45.000Z");
  });

  it("preserves explicitly offset notification timestamps", () => {
    expect(parseApplicationDateTime("2026-09-13T17:30:45+08:00")?.toISOString()).toBe("2026-09-13T09:30:45.000Z");
  });

  it("uses the requested fallback for missing or invalid values", () => {
    expect(formatApplicationDateTime(null, "Not sent")).toBe("Not sent");
    expect(formatApplicationDateTime("invalid", "Not sent")).toBe("Not sent");
  });
});
