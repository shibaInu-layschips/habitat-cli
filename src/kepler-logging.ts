export function logKeplerRequest(method: string, pathname: string, status: number | string) {
  console.log(`[kepler] ${method} ${pathname} -> ${status}`);
}
