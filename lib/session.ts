const SESSION_KEY = 'bajaj_session'

export function getSessionToken(): string {
  if (typeof window === 'undefined') return ''
  let token = localStorage.getItem(SESSION_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, token)
  }
  return token
}

export function setSessionToken(t: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, t)
}
