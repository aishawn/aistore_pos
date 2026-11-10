/** Same-origin Orithos API request; authentication stays in the session BFF. */
export async function fetchOrithosApi(path: string, init?: RequestInit) {
  const url = path.startsWith("/api/") ? path : `/api/${path.replace(/^\/+/, "")}`;
  return fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
}
