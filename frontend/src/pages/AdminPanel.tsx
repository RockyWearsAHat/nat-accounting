import React, { useEffect, useState } from 'react';
import { http } from '../lib/http';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import styles from '../components/calendar.module.css';

interface User { email:string; role:string; }
interface CalendarConfig { calendars:any[]; whitelist:string[]; busyEvents?:string[]; colors?:Record<string,string>; }

// Subcomponents --------------------------------------------------
const ConsultationsList: React.FC<{ data:any[]|null }> = ({ data }) => {
  if (!data) return <p>Loading consultations…</p>;
  return (
    <details open className={styles.sectionCard}>
      <summary>Consultations ({data.length})</summary>
      <ul className={styles.consultationsList}>
        {data.map(c => (
          <li key={c.id}>
            <strong>{c.name}</strong> – {c.company} – {new Date(c.createdAt).toLocaleString()}<br/>
            <span className={styles.muted}>{c.email}</span>
          </li>
        ))}
      </ul>
    </details>
  );
};

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
  const [consultations,setConsultations] = useState<any[]|null>(null);
  const [config,setConfig] = useState<CalendarConfig|null>(null);
  const [settings,setSettings] = useState<{ timezone:string; businessName:string; businessHours:any }|null>(null);
  const [availableTimezones,setAvailableTimezones] = useState<any[]>([]);
  const [hours,setHours] = useState<any|null>(null);
  const [loadingWeek,setLoadingWeek] = useState(false);
  const [googleStatus,setGoogleStatus] = useState<{connected:boolean; expires?:string} | null>(null);
  const [connectingGoogle,setConnectingGoogle] = useState(false);

  const loadConsultations = async()=>{ try { const data = await http.get<any>('/api/consultations/admin'); setConsultations(data.consultations||[]);} catch { setConsultations([]);} };
  const loadConfig = async()=>{ 
    try { 
      const data = await http.get<any>('/api/icloud/config');
      setConfig({ calendars: data.calendars, whitelist: data.whitelist, busyEvents: data.busyEvents||[], colors: data.colors||{} }); 
    } catch(e){ console.error(e);} 
  };
  const loadSettings = async()=>{ try { const data = await http.get<any>('/api/settings'); setSettings(data.settings);} catch(e){ console.error(e);} };
  const loadTimezones = async()=>{ try { const data = await http.get<any>('/api/settings/timezones'); setAvailableTimezones(data.timezones);} catch(e){ console.error(e);} };
  const loadHours = async()=>{ try { const data = await http.get<any>('/api/hours'); if(data.ok) setHours(data.hours);} catch(e){ console.error(e);} };

  useEffect(()=>{ (async()=>{ await loadConsultations(); await loadConfig(); await loadSettings(); await loadTimezones(); await loadHours(); })(); },[]);
  useEffect(()=>{ (async()=>{ try { const data = await http.get<any>('/api/google/status'); setGoogleStatus(data);} catch{} })(); },[]);

  const startGoogleAuth = async()=> {
    setConnectingGoogle(true);
    try { const data = await http.get<any>('/api/google/auth/url'); window.location.href = data.url; } finally { setConnectingGoogle(false);} };

  const toggleCalendarBusy = async(url:string)=>{ 
    if(!config) return; 
    const nextBusy = config.calendars.filter(c=>c.busy).map(c=>c.url);
    const idx = nextBusy.indexOf(url); if(idx>=0) nextBusy.splice(idx,1); else nextBusy.push(url);
    const data = await http.post<any>('/api/icloud/config',{ busy: nextBusy, colors: config.colors });
  // Reorder: all busy first (preserving relative order), then not busy
  const ordered = [...data.calendars.filter((c:any)=>c.busy), ...data.calendars.filter((c:any)=>!c.busy)];
  setConfig(c=> c? { ...c, calendars: ordered, colors: data.colors||c.colors }: c);
  };
  const updateCalendarColor = async(url:string,color:string)=>{ 
    if(!config) return; 
    const colors={...(config.colors||{}),[url]:color};
    const busy=config.calendars.filter(c=>c.busy).map(c=>c.url);
    const data = await http.post<any>('/api/icloud/config',{ busy, colors});
  const ordered = [...data.calendars.filter((c:any)=>c.busy), ...data.calendars.filter((c:any)=>!c.busy)];
  setConfig(c=> c? { ...c, calendars: ordered, colors: data.colors||colors }: c);
  };

  return (
    <div className={styles.adminLayout}>
      <div className={styles.headerRow}>
        <h2>Admin Dashboard</h2>
        <button onClick={onLogout} className={styles.btnSecondary}>Logout</button>
      </div>
      <ConsultationsList data={consultations} />
      <div className={styles.calendarWrapper}>
        <WeeklyCalendar config={config} hours={hours} timezone={settings?.timezone} onConfigRefresh={loadConfig} />
      </div>
      <div className={styles.sectionCard}>
        <h4>Google Calendar Integration</h4>
        {googleStatus?.connected ? (
          <>
            <p className={styles.mutedSmall}>Connected. Tokens stored for admin user{googleStatus.expires && ` (exp: ${new Date(googleStatus.expires).toLocaleString()})`}.</p>
            <button onClick={loadConfig} className={styles.btnSecondary}>Reload Google Calendars</button>
          </>
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
