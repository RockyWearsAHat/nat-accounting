import React, { useState, useEffect } from 'react';
import { http } from '../lib/http';
import styles from '../components/calendar.module.css';

interface ScheduledMeeting {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  videoUrl?: string;
  zoomMeetingId?: string;
  clientName?: string;
  clientEmail?: string;
  provider: string;
  calendar: string;
  status: 'scheduled' | 'cancelled' | 'completed';
}

interface RequestedMeeting {
  id: string;
  clientName: string;
  clientEmail: string;
  company: string;
  requestedServices: string[];
  notes?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'denied';
}

interface MeetingsSectionProps {
  onMeetingUpdate?: () => void;
}

export const MeetingsSection: React.FC<MeetingsSectionProps> = ({ onMeetingUpdate }) => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'requested'>('scheduled');
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledMeeting[]>([]);
  const [requestedMeetings, setRequestedMeetings] = useState<RequestedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadScheduledMeetings = async () => {
    try {
      const data = await http.get<{ meetings: ScheduledMeeting[] }>('/api/meetings/scheduled');
      setScheduledMeetings(data.meetings || []);
    } catch (err: any) {
      console.error('Failed to load scheduled meetings:', err);
      setError('Failed to load scheduled meetings');
    }
  };

  const loadRequestedMeetings = async () => {
    try {
      const data = await http.get<{ meetings: RequestedMeeting[] }>('/api/meetings/requested');
      setRequestedMeetings(data.meetings || []);
    } catch (err: any) {
      console.error('Failed to load requested meetings:', err);
      // Don't set error for requested meetings since it's not fully implemented
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      await Promise.all([loadScheduledMeetings(), loadRequestedMeetings()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      })
    };
  };

  const isUpcoming = (dateString: string) => {
    return new Date(dateString) > new Date();
  };

  const handleJoinMeeting = (meeting: ScheduledMeeting) => {
    if (meeting.videoUrl) {
      window.open(meeting.videoUrl, '_blank');
    } else {
      alert('No meeting link available');
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting? This cannot be undone.')) {
      return;
    }

    try {
      await http.del(`/api/meetings/${meetingId}`);
      await loadScheduledMeetings(); // Refresh the list
      if (onMeetingUpdate) onMeetingUpdate();
    } catch (err: any) {
      console.error('Failed to cancel meeting:', err);
      alert('Failed to cancel meeting. Please try again.');
    }
  };

  const handleReschedule = (meeting: ScheduledMeeting) => {
    // TODO: Implement reschedule functionality
    // This would open a modal similar to ScheduleAppointmentModal
    alert('Reschedule functionality coming soon. For now, please cancel and create a new appointment.');
  };

  if (loading) {
    return (
      <div className={styles.sectionCard}>
        <h4>Meetings</h4>
        <p>Loading meetings...</p>
      </div>
    );
  }

  return (
    <div className={styles.sectionCard}>
      <div className={styles.meetingsHeader}>
        <h4>Meetings</h4>
        <div className={styles.meetingsTabs}>
          <button
            className={`${styles.tabButton} ${activeTab === 'scheduled' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('scheduled')}
          >
            Scheduled ({scheduledMeetings.length})
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'requested' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('requested')}
          >
            Requested ({requestedMeetings.length})
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.meetingsContent}>
        {activeTab === 'scheduled' && (
          <div className={styles.scheduledMeetings}>
            {scheduledMeetings.length === 0 ? (
              <p className={styles.emptyState}>No scheduled meetings</p>
            ) : (
              <div className={styles.meetingsList}>
                {scheduledMeetings.map(meeting => {
                  const { date, time } = formatDateTime(meeting.start);
                  const upcoming = isUpcoming(meeting.start);
                  
                  return (
                    <div key={meeting.id} className={`${styles.meetingCard} ${!upcoming ? styles.pastMeeting : ''}`}>
                      <div className={styles.meetingInfo}>
                        <div className={styles.meetingTitle}>
                          <h5>{meeting.summary}</h5>
                          {!upcoming && <span className={styles.pastLabel}>Past</span>}
                        </div>
                        <div className={styles.meetingDetails}>
                          <div className={styles.meetingTime}>
                            <strong>{date}</strong> at {time}
                          </div>
                          {meeting.clientName && (
                            <div className={styles.clientInfo}>
                              Client: {meeting.clientName}
                              {meeting.clientEmail && ` (${meeting.clientEmail})`}
                            </div>
                          )}
                          {meeting.location && (
                            <div className={styles.meetingLocation}>
                              📍 {meeting.location}
                            </div>
                          )}
                          {meeting.description && (
                            <div className={styles.meetingDescription}>
                              {meeting.description}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className={styles.meetingActions}>
                        {upcoming && meeting.videoUrl && (
                          <button
                            className={styles.joinButton}
                            onClick={() => handleJoinMeeting(meeting)}
                            title="Join meeting"
                          >
                            🎥 Join
                          </button>
                        )}
                        {upcoming && (
                          <>
                            <button
                              className={styles.rescheduleButton}
                              onClick={() => handleReschedule(meeting)}
                              title="Reschedule meeting"
                            >
                              📅 Reschedule
                            </button>
                            <button
                              className={styles.deleteButton}
                              onClick={() => handleDeleteMeeting(meeting.id)}
                              title="Cancel meeting"
                            >
                              🗑️ Cancel
                            </button>
                          </>
                        )}
                        {meeting.zoomMeetingId && (
                          <div className={styles.zoomInfo}>
                            Zoom ID: {meeting.zoomMeetingId}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'requested' && (
          <div className={styles.requestedMeetings}>
            {requestedMeetings.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No meeting requests</p>
                <p className={styles.emptyStateSubtext}>
                  Meeting requests will appear here when clients submit consultation forms
                </p>
              </div>
            ) : (
              <div className={styles.meetingsList}>
                {requestedMeetings.map(request => (
                  <div key={request.id} className={styles.meetingCard}>
                    <div className={styles.meetingInfo}>
                      <div className={styles.meetingTitle}>
                        <h5>{request.clientName} - {request.company}</h5>
                        <span className={`${styles.statusBadge} ${styles[request.status]}`}>
                          {request.status}
                        </span>
                      </div>
                      <div className={styles.meetingDetails}>
                        <div className={styles.clientInfo}>
                          {request.clientEmail}
                        </div>
                        <div className={styles.requestedServices}>
                          Services: {request.requestedServices.join(', ')}
                        </div>
                        {request.notes && (
                          <div className={styles.meetingDescription}>
                            {request.notes}
                          </div>
                        )}
                        <div className={styles.requestDate}>
                          Requested: {new Date(request.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className={styles.meetingActions}>
                      {request.status === 'pending' && (
                        <>
                          <button className={styles.approveButton}>
                            ✅ Approve
                          </button>
                          <button className={styles.denyButton}>
                            ❌ Deny
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};