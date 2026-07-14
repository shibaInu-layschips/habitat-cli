import { describe, expect, test } from "bun:test";
import { startHabitatApiServer } from "../src/server-runtime";

describe("server runtime", () => {
  test("throws a clear error when the requested port is busy", () => {
    const serve = ((options: { port: number }) => {
      expect(options.port).toBe(18787);
      const error = new Error("port busy");
      (error as { code?: string }).code = "EADDRINUSE";
      throw error;
    }) as unknown as typeof Bun.serve;

    expect(() =>
      startHabitatApiServer(
        (() => new Response("ok")) as Parameters<typeof Bun.serve>[0]["fetch"],
        "127.0.0.1",
        18787,
        serve,
      ),
    ).toThrow(
      'Port 18787 is already in use. Stop the existing server or set HABITAT_API_PORT to a different port.',
    );
  });
});
