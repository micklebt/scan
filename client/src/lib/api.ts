import { queryClient } from "./queryClient";

export async function apiRequest(method: string, url: string, body?: any) {
  const options: RequestInit = {
    method,
    headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const err = contentType.includes("application/json")
      ? await res.json().catch(() => ({ message: res.statusText }))
      : { message: (await res.text().catch(() => "")) || res.statusText };
    throw new Error(err.message || "Request failed");
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text().catch(() => null);
}
