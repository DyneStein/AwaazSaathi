export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = opts
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try { const j = await res.json(); msg = j.detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} })

export function timeAgo(iso?: string | null) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const CROP_EN: Record<string, string> = { wheat: 'Wheat', cotton: 'Cotton', rice: 'Rice', sugarcane: 'Sugarcane', maize: 'Maize' }
export const CROP_UR: Record<string, string> = { wheat: 'گندم', cotton: 'کپاس', rice: 'مونجی', sugarcane: 'کماد', maize: 'مکئی' }
