import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { CalendarEvent } from "../types/calendar";

interface CachedCalendarState {
  // Data
  events: CalendarEvent[];
  lastFetch: number;
  isLoading: boolean;
  error: string | null;
  
  // Status
  isCached: boolean;
  syncTriggered: boolean;
  syncStatus: SyncStatus | null;
  
  // Actions
  refreshEvents: (force?: boolean) => Promise<void>;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (eventId: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (eventId: string) => void;
  getEventsForDateRange: (start: Date, end: Date) => CalendarEvent[];
  getEventsForDay: (date: Date) => CalendarEvent[];
  triggerSync: () => Promise<void>;
}

interface SyncStatus {
  totalCalendars: number;
  activeCalendars: number;
  totalEvents: number;
  lastSyncAt: string | null;
  calendars: Array<{
    provider: string;
    calendarId: string;
    isActive: boolean;
    isSyncing: boolean;
    lastSyncAt: string;
    syncErrors: number;
    lastError?: string;
  }>;
}

const CalendarCacheContext = createContext<CachedCalendarState | null>(null);

export function CalendarCacheProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [lastFetch, setLastFetch] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Fetch events from cache-first endpoint
  const refreshEvents = useCallback(async (force = false) => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (force) params.set('refresh', 'true');
      
      const response = await fetch(`/api/cached/all?${params}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch events');
      }
      
      setEvents(data.events || []);
      setLastFetch(Date.now());
      setIsCached(data.cached || false);
      setSyncTriggered(data.syncTriggered || false);
      
      console.log(`Loaded ${data.events?.length || 0} events from cache`);
      
    } catch (err) {
      console.error('Failed to refresh events:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Add event optimistically
  const addEvent = useCallback((event: CalendarEvent) => {
    setEvents(prev => {
      // Check if event already exists (prevent duplicates)
      const exists = prev.some(e => e.uid === event.uid);
      if (exists) {
        return prev.map(e => e.uid === event.uid ? event : e);
      }
      return [...prev, event].sort((a, b) => 
        new Date(a.start).getTime() - new Date(b.start).getTime()
      );
    });
  }, []);

  // Update event optimistically
  const updateEvent = useCallback((eventId: string, updates: Partial<CalendarEvent>) => {
    setEvents(prev => prev.map(event => 
      event.uid === eventId ? { ...event, ...updates } : event
    ));
  }, []);

  // Delete event optimistically
  const deleteEvent = useCallback((eventId: string) => {
    setEvents(prev => prev.filter(event => event.uid !== eventId));
  }, []);

  // Get events for date range
  const getEventsForDateRange = useCallback((start: Date, end: Date): CalendarEvent[] => {
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : eventStart;
      
      return (eventStart >= start && eventStart <= end) ||
             (eventEnd >= start && eventEnd <= end) ||
             (eventStart <= start && eventEnd >= end);
    });
  }, [events]);

  // Get events for specific day
  const getEventsForDay = useCallback((date: Date): CalendarEvent[] => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    return getEventsForDateRange(dayStart, dayEnd);
  }, [getEventsForDateRange]);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    try {
      const response = await fetch('/api/cached/sync/trigger', { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        setSyncTriggered(true);
        // Refresh events after a short delay to get updated data
        setTimeout(() => refreshEvents(), 2000);
      }
      
    } catch (err) {
      console.error('Failed to trigger sync:', err);
    }
  }, [refreshEvents]);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/cached/sync/status');
      const data = await response.json();
      
      if (response.ok) {
        setSyncStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    refreshEvents();
    fetchSyncStatus();
  }, [refreshEvents, fetchSyncStatus]);

  // Periodic background refresh (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if data is older than 30 seconds and not currently loading
      if (Date.now() - lastFetch > 30000 && !isLoading) {
        refreshEvents();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [lastFetch, isLoading, refreshEvents]);

  // Periodic sync status updates (every 60 seconds)
  useEffect(() => {
    const interval = setInterval(fetchSyncStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  const value: CachedCalendarState = {
    events,
    lastFetch,
    isLoading,
    error,
    isCached,
    syncTriggered,
    syncStatus,
    refreshEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDateRange,
    getEventsForDay,
    triggerSync
  };

  return (
    <CalendarCacheContext.Provider value={value}>
      {children}
    </CalendarCacheContext.Provider>
  );
}

export function useCalendarCache(): CachedCalendarState {
  const context = useContext(CalendarCacheContext);
  if (!context) {
    throw new Error('useCalendarCache must be used within a CalendarCacheProvider');
  }
  return context;
}

// Hook for getting events with automatic caching
export function useCachedEvents(dateRange?: { start: Date; end: Date }) {
  const cache = useCalendarCache();
  
  const filteredEvents = React.useMemo(() => {
    if (!dateRange) return cache.events;
    return cache.getEventsForDateRange(dateRange.start, dateRange.end);
  }, [cache.events, dateRange, cache.getEventsForDateRange]);
  
  return {
    events: filteredEvents,
    isLoading: cache.isLoading,
    error: cache.error,
    isCached: cache.isCached,
    refresh: cache.refreshEvents,
    addEvent: cache.addEvent,
    updateEvent: cache.updateEvent,
    deleteEvent: cache.deleteEvent
  };
}

// Hook for day-specific events
export function useDayEvents(date: Date) {
  const cache = useCalendarCache();
  
  const dayEvents = React.useMemo(() => {
    return cache.getEventsForDay(date);
  }, [cache.events, date, cache.getEventsForDay]);
  
  return {
    events: dayEvents,
    isLoading: cache.isLoading,
    error: cache.error,
    refresh: cache.refreshEvents,
    addEvent: cache.addEvent,
    updateEvent: cache.updateEvent,
    deleteEvent: cache.deleteEvent
  };
}