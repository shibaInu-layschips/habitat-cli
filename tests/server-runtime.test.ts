import { describe, expect, test } from "bun:test";
import { startHabitatApiServer } from "../src/server-runtime";

describe("server runtime", () => {
  test("falls back to an available port when the requested one is busy", () => {
    const logs: string[] = [];
    let attempts = 0;

    const serve = ((options: { port: number }) => {
      attempts += 1;

      if (attempts === 1) {
        const error = new Error("port busy");
        (error as { code?: string }).code = "EADDRINUSE";
        throw error;
      }

      expect(options.port).toBe(0);
      return { port: 49876 } as const;
    }) as unknown as typeof Bun.serve;

    const server = startHabitatApiServer(
      (() => new Response("ok")) as Parameters<typeof Bun.serve>[0]["fetch"],
      "127.0.0.1",
      18787,
      {
        log: (message: string) => {
          logs.push(message);
        },
      },
      serve,
    );

    expect(server.port).toBe(49876);
    expect(attempts).toBe(2);
    expect(logs).toEqual(["Port 18787 is already in use. Starting on an available port instead."]);
  });
});
