import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface NoticeAcceptance {
  /** When the notice was accepted in this session, before the first profile is saved. */
  acceptedAt: string | null;
  accept(at: Date): void;
}

const NoticeAcceptanceContext = createContext<NoticeAcceptance | null>(null);

/**
 * Remembers, for this run of the app, that the user accepted the notice.
 * It is kept in memory, not in the screen address, so the profile form cannot be opened past the notice by a link.
 */
export function NoticeAcceptanceProvider({ children }: { children: ReactNode }) {
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const value = useMemo(() => ({ acceptedAt, accept: (at: Date) => setAcceptedAt(at.toISOString()) }), [acceptedAt]);
  return <NoticeAcceptanceContext.Provider value={value}>{children}</NoticeAcceptanceContext.Provider>;
}

export function useNoticeAcceptance(): NoticeAcceptance {
  const value = useContext(NoticeAcceptanceContext);
  if (value === null) throw new Error('useNoticeAcceptance must be used inside NoticeAcceptanceProvider.');
  return value;
}
