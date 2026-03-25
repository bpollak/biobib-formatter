import { ProcessingSession, SessionStatus } from './types';
import { SESSION_TTL_MS, SESSION_CLEANUP_INTERVAL_MS } from './constants';

// In-memory session store
const sessions = new Map<string, ProcessingSession>();

// TTL cleanup — runs every minute, removes sessions older than 1 hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of sessions) {
      if (session.createdAt < cutoff) {
        sessions.delete(id);
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
}

export function getSession(id: string): ProcessingSession | undefined {
  return sessions.get(id);
}

export function setSession(session: ProcessingSession): void {
  sessions.set(session.id, session);
}

export function updateSession(id: string, updates: Partial<ProcessingSession>): void {
  const session = sessions.get(id);
  if (session) {
    sessions.set(id, { ...session, ...updates });
  }
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function updateSessionStatus(
  id: string,
  status: SessionStatus,
  stage: string,
  progress: number
): void {
  updateSession(id, { status, stage, progress });
}

export { sessions };
