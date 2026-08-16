export interface AuthSession {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  apiKey: string
  email: string
}

const STORAGE_KEY = 'logpulse.auth.session'
const listeners = new Set<() => void>()

let session: AuthSession | null = readFromStorage()

function readFromStorage(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function getAuthSession(): AuthSession | null {
  return session
}

export function setAuthSession(next: AuthSession): void {
  session = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notify()
}

export function clearAuthSession(): void {
  session = null
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
