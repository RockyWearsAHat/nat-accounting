import React, { createContext, useContext, useState, useCallback } from 'react';

interface CalendarEvent {
  uid?: string;
  id?: string;
  summary?: string;
  title?: string;
  description?: string;
  start: string;
  end?: string;
  location?: string;
  url?: string;
  calendar: string;
  provider?: string;
}

interface CalendarEventsContextType {
  events: CalendarEvent[];
  setEvents: (events: CalendarEvent[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  refreshEvents: () => void;
}

const CalendarEventsContext = createContext<CalendarEventsContextType | undefined>(undefined);

export const CalendarEventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshEvents = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const value: CalendarEventsContextType = {
    events,
    setEvents,
    loading,
    setLoading,
    error,
    setError,
    refreshEvents
  };

  return (
    <CalendarEventsContext.Provider value={value}>
      {children}
    </CalendarEventsContext.Provider>
  );
};

export const useCalendarEvents = (): CalendarEventsContextType => {
  const context = useContext(CalendarEventsContext);
  if (context === undefined) {
    throw new Error('useCalendarEvents must be used within a CalendarEventsProvider');
  }
  return context;
};