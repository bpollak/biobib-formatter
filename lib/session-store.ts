import { ProcessingSession, SessionStatus } from './types';

// In-memory session store
const sessions = new Map<string, ProcessingSession>();

// Note: TTL cleanup timer removed — on Vercel serverless, each function instance
// has its own memory and timers don't persist between invocations.
// Sessions are cleaned up lazily on access instead.

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
