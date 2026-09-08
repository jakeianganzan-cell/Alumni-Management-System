import { describe, expect, it } from "vitest";
import { ApiError, readApiResponse } from "@/lib/api";

describe("API error messages", () => {
  it("keeps an understandable public message", async () => {
    const response = new Response(JSON.stringify({ error: "Unable to save your profile. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    await expect(readApiResponse(response)).rejects.toMatchObject({
      message: "Unable to save your profile. Please try again.",
      status: 500,
    } satisfies Partial<ApiError>);
  });

  it("does not display SQL or stack details returned by a server", async () => {
    const response = new Response(JSON.stringify({ error: "SQL error: SELECT secret FROM users at C:\\server\\app.ts" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    await expect(readApiResponse(response)).rejects.toMatchObject({
      message: "Unable to complete your request. Please try again.",
      status: 500,
    } satisfies Partial<ApiError>);
  });

  it("does not display non-JSON proxy or server error bodies", async () => {
    const response = new Response("Internal stack trace", { status: 502 });

    await expect(readApiResponse(response)).rejects.toMatchObject({
      message: "Unable to complete your request. Please try again.",
      status: 502,
    } satisfies Partial<ApiError>);
  });
});
