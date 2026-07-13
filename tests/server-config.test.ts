import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveApiHost, resolveApiPort } from "../src/server-config";

let originalHost: string | undefined;
let originalPort: string | undefined;
let originalStateApiPort: string | undefined;
let originalLegacyPort: string | undefined;

beforeEach(() => {
  originalHost = process.env.HABITAT_API_HOST;
  originalPort = process.env.HABITAT_API_PORT;
  originalStateApiPort = process.env.STATE_API_PORT;
  originalLegacyPort = process.env.PORT;
});

afterEach(() => {
  process.env.HABITAT_API_HOST = originalHost;
  process.env.HABITAT_API_PORT = originalPort;
  process.env.STATE_API_PORT = originalStateApiPort;
  process.env.PORT = originalLegacyPort;
});

describe("server config", () => {
  test("defaults to all interfaces and the standard port", () => {
    delete process.env.HABITAT_API_HOST;
    delete process.env.HABITAT_API_PORT;
    delete process.env.STATE_API_PORT;
    delete process.env.PORT;

    expect(resolveApiHost()).toBe("0.0.0.0");
    expect(resolveApiPort()).toBe(8787);
  });

  test("honors explicit host and port overrides", () => {
    process.env.HABITAT_API_HOST = "0.0.0.0";
    process.env.HABITAT_API_PORT = "18787";

    expect(resolveApiHost()).toBe("0.0.0.0");
    expect(resolveApiPort()).toBe(18787);
  });
});
