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
  logger: Pick<typeof console, "log"> = console,
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

    logger.log(`Port ${port} is already in use. Starting on an available port instead.`);

    return serve({
      fetch,
      hostname,
      port: 0,
    });
  }
}
