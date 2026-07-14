type ServeLike = (options: { fetch: any; hostname: string; port: number }) => { port?: number };

function isAddressInUseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: unknown }).code === "EADDRINUSE";
}

export function startHabitatApiServer(
  fetch: any,
  hostname: string,
  port: number,
  serve: ServeLike = Bun.serve,
) {
  try {
    return serve({
      fetch,
      hostname,
      port,
    });
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }

    throw new Error(
      `Port ${port} is already in use. Stop the existing server or set HABITAT_API_PORT to a different port.`,
    );
  }
}
