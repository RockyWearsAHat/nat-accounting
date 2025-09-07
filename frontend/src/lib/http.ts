// Lightweight wrapper around fetch to replace axios usage.
// Adds JSON convenience, error handling, and automatic credentials.

export interface HttpError extends Error {
  status: number;
  data?: any;
}

async function request<T>(method: string, url: string, body?: any, opts: RequestInit = {}): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Accept': 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers||{}) },
    credentials: 'include',
    ...opts,
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const err: HttpError = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, data });
    throw err;
  }
  return data as T;
}

export const http = {
  get: <T>(url: string, params?: Record<string, any>) => {
    if (params && Object.keys(params).length) {
      const usp = new URLSearchParams();
      for (const [k,v] of Object.entries(params)) if (v!=null) usp.set(k,String(v));
      url += (url.includes('?')?'&':'?') + usp.toString();
    }
    return request<T>('GET', url);
  },
  post: <T>(url: string, body?: any) => request<T>('POST', url, body),
  put: <T>(url: string, body?: any) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
