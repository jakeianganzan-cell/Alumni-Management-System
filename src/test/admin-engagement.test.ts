import { describe, expect, it } from "vitest";
import { buildTopBatches } from "@/pages/admin/Engagement";

describe("Admin Engagement batch metrics", () => {
  it("is safe before the engagement query has returned", () => {
    expect(buildTopBatches(undefined)).toEqual([]);
  });

  it("groups engagement activity by alumni batch", () => {
    expect(buildTopBatches({
      profiles: [
        { id: "a", batch: "2024" },
        { id: "b", batch: "2024" },
      ],
      regs: [{ user_id: "a" }, { user_id: "b" }],
      comments: [{ user_id: "a" }],
    })).toEqual([
      { batch: "2024", events: 2, comments: 1, score: 25, memberCount: 2 },
    ]);
  });
});
