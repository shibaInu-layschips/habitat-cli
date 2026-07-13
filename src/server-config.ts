export function resolveApiHost() {
  const host = process.env.HABITAT_API_HOST?.trim();
  if (host && host.length > 0) {
    return host;
  }

  return "0.0.0.0";
}

export function resolveApiPort() {
  const portText = process.env.HABITAT_API_PORT?.trim() ?? process.env.STATE_API_PORT?.trim() ?? process.env.PORT?.trim() ?? "8787";
  const parsedPort = Number.parseInt(portText, 10);

  if (Number.isFinite(parsedPort) && parsedPort > 0) {
    return parsedPort;
  }

  return 8787;
}
