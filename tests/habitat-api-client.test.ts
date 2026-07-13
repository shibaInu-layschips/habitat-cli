import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getHabitatApiBaseUrl,
  HabitatApiError,
  postHabitatApiJson,
  requestHabitatApiJson,
} from "../src/habitat-api-client";

let originalBaseUrl: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalBaseUrl = process.env.HABITAT_API_BASE_URL;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  process.env.HABITAT_API_BASE_URL = originalBaseUrl;
  globalThis.fetch = originalFetch;
});

describe("habitat api client", () => {
  test("defaults to localhost when no base url is set", () => {
    delete process.env.HABITAT_API_BASE_URL;

    expect(getHabitatApiBaseUrl()).toBe("http://localhost:8787");
  });

  test("sends json and parses json responses", async () => {
    process.env.HABITAT_API_BASE_URL = "http://example.test";

    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("http://example.test/modules");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Headers).get("Accept")).toBe("application/json");
      expect((init?.headers as Headers).get("Content-Type")).toBe("application/json");
      expect(typeof init?.body === "string" ? init.body : String(init?.body)).toBe(
        JSON.stringify({ name: "demo" }),
      );

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await expect(postHabitatApiJson("/modules", { name: "demo" })).resolves.toEqual({ ok: true });
  });

  test("turns backend error responses into friendly api errors", async () => {
    process.env.HABITAT_API_BASE_URL = "http://example.test";

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "No registration found." }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });

    await expect(requestHabitatApiJson("/registration", { method: "GET" })).rejects.toBeInstanceOf(
      HabitatApiError,
    );

    try {
      await requestHabitatApiJson("/registration", { method: "GET" });
    } catch (error) {
      expect(error).toBeInstanceOf(HabitatApiError);
      const apiError = error as HabitatApiError;
      expect(apiError.message).toContain("Habitat API request failed (404 Not Found). No registration found.");
      expect(apiError.status).toBe(404);
    }
  });
});
