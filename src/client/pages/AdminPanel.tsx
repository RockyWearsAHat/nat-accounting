import React, { useEffect, useState } from 'react';
import { http } from '../lib/http';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import styles from '../components/calendar.module.css';
import { ScheduleAppointmentModal } from '../components/ScheduleAppointmentModal';
import { MeetingsSection } from '../components/MeetingsSection';
import { CalendarEventsProvider } from '../contexts/CalendarEventsContext';
import PricingCalculatorAdmin from '../components/PricingCalculatorAdmin';

interface User { email:string; role:string; }
interface CalendarConfig { calendars:any[]; whitelist:string[]; busyEvents?:string[]; colors?:Record<string,string>; }

// Subcomponents --------------------------------------------------

const CalendarSettings: React.FC<{ config:CalendarConfig|null; onBusyToggle:(url:string)=>void; onColor:(u:string,c:string)=>void; }> = ({ config, onBusyToggle, onColor }) => {
  if (!config) return <p className={styles.smallMuted}>Loading config…</p>;
  return (
    <div className={styles.settingsBlock}>
      <h4>Calendar Settings</h4>
      <div className={styles.calendarsWrap}>
        {config.calendars.map(cal => (
          <div key={cal.url} className={styles.calendarChip}>
            <input type='checkbox' checked={cal.busy} onChange={()=>onBusyToggle(cal.url)} />
            <span className={styles.calName}>{cal.displayName}</span>
            <input type='color' value={config.colors?.[cal.url] || '#ff3333'} onChange={e=>onColor(cal.url,e.target.value)} />
            <span className={styles.statusTag}>{cal.busy ? 'blocking' : 'hidden'}</span>
          </div>
        ))}
      </div>
      <div className={styles.uidGroups}>
        <div>
          <strong>Whitelisted</strong>
          <div className={styles.uidList}>
            {config.whitelist.length ? config.whitelist.map(u=> <code key={u}>{u}</code>) : <span className={styles.muted}>None</span>}
          </div>
        </div>
        <div>
          <strong>Force Busy</strong>
          <div className={styles.uidList}>
            {(config.busyEvents||[]).length ? (config.busyEvents||[]).map(u=> <code key={u}>{u}</code>) : <span className={styles.muted}>None</span>}
          </div>
        </div>
      </div>
      <p className={styles.helpText}>Whitelist removes blocking; Force Busy marks event blocking even if calendar not busy.</p>
    </div>
  );
};

// Main Admin Panel ------------------------------------------------
export const AdminPanel: React.FC<{ user:User; onLogout:()=>void; }> = ({ user, onLogout }) => {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Initialize config with cached data immediately
  const [config,setConfig] = useState<CalendarConfig|null>(() => {
    try {
      const cachedConfig = localStorage.getItem('calendar-config');
      if (cachedConfig) {
        console.log('[AdminPanel] Initializing with cached config');
        return JSON.parse(cachedConfig);
      }
    } catch (e) {
      console.warn('[AdminPanel] Failed to load cached config on init:', e);
    }
    return null;
  });
  const [settings,setSettings] = useState<{ timezone:string; businessName:string; businessHours:any }|null>(null);
  const [availableTimezones,setAvailableTimezones] = useState<any[]>([]);
  // Initialize hours with cached data immediately
  const [hours,setHours] = useState<any|null>(() => {
    try {
      const cachedHours = localStorage.getItem('business-hours');
      if (cachedHours) {
        console.log('[AdminPanel] Initializing with cached hours');
        return JSON.parse(cachedHours);
      }
    } catch (e) {
      console.warn('[AdminPanel] Failed to load cached hours on init:', e);
    }
    return null;
  });
  const [loadingWeek,setLoadingWeek] = useState(false);
  const [googleStatus,setGoogleStatus] = useState<{connected:boolean; expires?:string} | null>(null);
  const [connectingGoogle,setConnectingGoogle] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);



  const loadConfig = async()=>{ 
    try {
      // Load cached config immediately for instant display
      const cachedConfig = localStorage.getItem('calendar-config');
      if (cachedConfig) {
        try {
          const parsed = JSON.parse(cachedConfig);
          console.log('[AdminPanel] Loaded cached config:', parsed.calendars?.length, 'calendars');
          setConfig(parsed);
        } catch (e) {
          console.warn('[AdminPanel] Invalid cached config, clearing:', e);
          localStorage.removeItem('calendar-config');
        }
      }
      
      // Fetch fresh config in background
      const data = await http.get<any>('/api/icloud/config');
      // Only order on initial load, not on updates
      const ordered = [...data.calendars.filter((c:any)=>c.busy), ...data.calendars.filter((c:any)=>!c.busy)];
      const freshConfig = { calendars: ordered, whitelist: data.whitelist, busyEvents: data.busyEvents||[], colors: data.colors||{} };
      
      // Cache the fresh config for next time
      localStorage.setItem('calendar-config', JSON.stringify(freshConfig));
      console.log('[AdminPanel] Cached fresh config:', freshConfig.calendars?.length, 'calendars');
      
      setConfig(freshConfig); 
    } catch(e){ console.error('[AdminPanel] Config load failed:', e);} 
  };
  const loadSettings = async()=>{ try { const data = await http.get<any>('/api/settings'); setSettings(data.settings);} catch(e){ console.error(e);} };
  const loadTimezones = async()=>{ try { const data = await http.get<any>('/api/settings/timezones'); setAvailableTimezones(data.timezones);} catch(e){ console.error(e);} };
  const loadHours = async()=>{ 
    try { 
      // Load cached hours immediately for instant display
      const cachedHours = localStorage.getItem('business-hours');
      if (cachedHours) {
        try {
          const parsed = JSON.parse(cachedHours);
          console.log('[AdminPanel] Loaded cached business hours');
          setHours(parsed);
        } catch (e) {
          console.warn('[AdminPanel] Invalid cached hours, clearing:', e);
          localStorage.removeItem('business-hours');
        }
      }
      
      // Fetch fresh hours in background
      const data = await http.get<any>('/api/hours'); 
      if(data.ok) {
        // Cache the fresh hours for next time
        localStorage.setItem('business-hours', JSON.stringify(data.hours));
        console.log('[AdminPanel] Cached fresh business hours');
        setHours(data.hours);
      }
    } catch(e){ console.error('[AdminPanel] Hours load failed:', e);} 
  };

  useEffect(()=>{ (async()=>{ await loadConfig(); await loadSettings(); await loadTimezones(); await loadHours(); })(); },[]);
  useEffect(()=>{ (async()=>{ try { const data = await http.get<any>('/api/google/status'); setGoogleStatus(data);} catch{} })(); },[]);

  const startGoogleAuth = async()=> {
    setConnectingGoogle(true);
    try { const data = await http.get<any>('/api/google/auth/url'); window.location.href = data.url; } finally { setConnectingGoogle(false);} };

  const toggleCalendarBusy = async(url:string)=>{ 
    if(!config) return; 
    const nextBusy = config.calendars.filter(c=>c.busy).map(c=>c.url);
    const idx = nextBusy.indexOf(url); if(idx>=0) nextBusy.splice(idx,1); else nextBusy.push(url);
    
    try {
      const data = await http.post<any>('/api/icloud/config',{ busy: nextBusy, colors: config.colors });
      
      // Update config without reordering to avoid visual jumping
      // Just update the busy status and colors, preserve existing order
      setConfig(c => {
        if (!c) return c;
        const updatedCalendars = c.calendars.map(cal => {
          const updatedCal = data.calendars.find((dc: any) => dc.url === cal.url);
          return updatedCal ? { ...cal, busy: updatedCal.busy } : cal;
        });
        return { ...c, calendars: updatedCalendars, colors: data.colors || c.colors };
      });
      
      // Trigger calendar refresh to update events
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
    } catch (error) {
      console.error('Error toggling calendar busy status:', error);
    }
  };
  const updateCalendarColor = async(url:string,color:string)=>{ 
    if(!config) return; 
    const colors={...(config.colors||{}),[url]:color};
    const busy=config.calendars.filter(c=>c.busy).map(c=>c.url);
    
    try {
      const data = await http.post<any>('/api/icloud/config',{ busy, colors});
      
      // Update colors without reordering calendars
      setConfig(c => c ? { ...c, colors: data.colors || colors } : c);
      
      // Trigger calendar refresh to update colors
      window.dispatchEvent(new CustomEvent('calendar-refresh'));
    } catch (error) {
      console.error('Error updating calendar color:', error);
    }
  };

  return (
    <div className={styles.adminLayout}>
      <div className={styles.headerRow}>
        <h2>Admin Dashboard</h2>
        <button onClick={onLogout} className={styles.btnSecondary}>Logout</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <button className={styles.btnPrimary} onClick={() => setShowScheduleModal(true)}>
          + Schedule Appointment
        </button>
      </div>
      <ScheduleAppointmentModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onScheduled={() => {
          loadConfig();
          setShowScheduleModal(false);
          // Also trigger calendar refresh if possible
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
          }
        }}
      />
      <CalendarEventsProvider>
        <MeetingsSection onMeetingUpdate={() => {
          loadConfig();
          // Refresh calendar if possible
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('calendar-refresh'));
          }
        }} />
        
        <div className={styles.sectionCard}>
          <h4>Calendar Display</h4>

        </div>
        
        <div className={styles.calendarWrapper}>
          <WeeklyCalendar 
            config={config} 
            hours={hours} 
            onConfigRefresh={loadConfig}
            onConsultationUpdate={() => {}} // No consultations in admin panel
          />
        </div>
        <PricingCalculatorAdmin />
      </CalendarEventsProvider>
      <div className={styles.sectionCard}>
        <h4>Google Calendar Integration</h4>
        {googleStatus?.connected ? (
          (() => {
            const expired = googleStatus.expires && new Date(googleStatus.expires).getTime() < Date.now();
            if (expired) {
              return (
                <>
                  <p className={styles.mutedSmall}>
                    Token expired ({googleStatus.expires && new Date(googleStatus.expires).toLocaleString()}).
                  </p>
                  <button disabled={connectingGoogle} onClick={startGoogleAuth} className={styles.btnPrimary}>
                    {connectingGoogle ? 'Redirecting…' : 'Reauthorize Google Calendar'}
                  </button>
                </>
              );
            }
            return (
              <>
                <p className={styles.mutedSmall}>Connected. Tokens stored for admin user{googleStatus.expires && ` (exp: ${new Date(googleStatus.expires).toLocaleString()})`}.</p>
                <button onClick={loadConfig} className={styles.btnSecondary}>Reload Google Calendars</button>
              </>
            );
          })()
        ) : (
          <button disabled={connectingGoogle} onClick={startGoogleAuth} className={styles.navButton}>{connectingGoogle? 'Redirecting…':'Connect Google Calendar'}</button>
        )}
      </div>
      <div className={styles.siteSettings}>
        <h3>Site Settings</h3>
        {settings && availableTimezones.length>0 && (
          <div className={styles.timezoneRow}>
            <label>Timezone</label>
            <select value={settings.timezone} onChange={e=> http.post<any>('/api/settings',{ timezone:e.target.value}).then(r=> setSettings(r.settings))}>
              {availableTimezones.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span className={styles.mutedSmall}>Events display in this timezone.</span>
          </div>
        )}
      </div>
      <CalendarSettings config={config} onBusyToggle={toggleCalendarBusy} onColor={updateCalendarColor} />
    </div>
  );
};
