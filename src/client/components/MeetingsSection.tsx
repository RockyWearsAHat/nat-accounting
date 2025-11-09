import React, { useState, useEffect } from 'react';
import { http } from '../lib/http';
import styles from '../components/calendar.module.css';
import { ScheduleAppointmentModal } from './ScheduleAppointmentModal';


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
  const [activeTab, setActiveTab] = useState<'scheduled' | 'past' | 'requested'>('scheduled');
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledMeeting[]>([]);
  const [pastMeetings, setPastMeetings] = useState<ScheduledMeeting[]>([]);
  const [requestedMeetings, setRequestedMeetings] = useState<RequestedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [meetingToReschedule, setMeetingToReschedule] = useState<ScheduledMeeting | null>(null);

  // Get events from shared context


  const loadScheduledMeetings = async () => {
    try {
      setLoading(true);
      
      // Use meetings API for better filtering
      const response = await http.get('/api/meetings/scheduled') as { meetings: ScheduledMeeting[] };
      const allMeetings: ScheduledMeeting[] = response.meetings || [];
      
      const now = new Date();
      
      // Split into future/ongoing and past meetings
      const upcoming = allMeetings.filter(meeting => {
        const meetingEnd = new Date(meeting.end);
        return meetingEnd >= now; // Include ongoing and future meetings
      });
      
      const past = allMeetings.filter(meeting => {
        const meetingEnd = new Date(meeting.end);
        return meetingEnd < now; // Only truly completed meetings
      });
      
      setScheduledMeetings(upcoming);
      setPastMeetings(past.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())); // Most recent first
    } catch (err: any) {
      console.error('Failed to load scheduled meetings:', err);
      setError('Failed to load scheduled meetings');
    } finally {
      setLoading(false);
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

  // Load meetings on mount
  useEffect(() => {
    loadScheduledMeetings();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      await loadRequestedMeetings(); // Only load requested meetings from API
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

  const isUpcoming = (startDateString: string, endDateString?: string) => {
    const now = new Date();
    const endDate = endDateString ? new Date(endDateString) : new Date(startDateString);
    return endDate >= now; // Meeting is upcoming if it hasn't ended yet
  };

  const handleJoinMeeting = (meeting: ScheduledMeeting) => {
    if (meeting.videoUrl && meeting.videoUrl.trim()) {
      console.log(meeting.videoUrl);
      window.open(meeting.videoUrl, '_blank');
    } else if (meeting.zoomMeetingId && meeting.zoomMeetingId.trim()) {
      // If we have a Zoom meeting ID but no direct URL, construct the join URL
      const zoomUrl = `https://zoom.us/j/${meeting.zoomMeetingId}`;
      window.open(zoomUrl, '_blank');
    } else {
      alert('No meeting link available for this appointment. You can add a video conference link by rescheduling the meeting.');
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting? This cannot be undone.')) {
      return;
    }

    try {
      // Optimistically remove meeting from UI immediately
      setScheduledMeetings(prev => prev.filter(m => m.id !== meetingId));
      setPastMeetings(prev => prev.filter(m => m.id !== meetingId));
      
      await http.del(`/api/meetings/${meetingId}`);
      
      alert('Meeting canceled successfully.');
    } catch (err: any) {
      console.error('Failed to cancel meeting:', err);
      
      // Revert optimistic update on error
      loadScheduledMeetings();
      
      const errorMessage = err.response?.data?.error || err.message || 'Unknown error';
      alert(`Failed to cancel meeting: ${errorMessage}. Please contact support if this persists.`);
    }
  };

  const handleReschedule = (meeting: ScheduledMeeting) => {
    setMeetingToReschedule(meeting);
    setShowRescheduleModal(true);
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
            className={`${styles.tabButton} ${activeTab === 'past' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('past')}
          >
            Past ({pastMeetings.length})
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
                  const upcoming = isUpcoming(meeting.start, meeting.end);
                  const now = new Date();
                  const isOngoing = new Date(meeting.start) <= now && new Date(meeting.end) >= now;
                  
                  return (
                    <div key={meeting.id} className={`${styles.meetingCard} ${!upcoming ? styles.pastMeeting : ''}`}>
                      <div className={styles.meetingInfo}>
                        <div className={styles.meetingTitle}>
                          <h5>{meeting.summary}</h5>
                          {meeting.clientName && meeting.clientName !== meeting.summary && (
                            <div className={styles.clientSubtitle}>
                              Client: {meeting.clientName}
                            </div>
                          )}
                          {isOngoing && <span className={styles.ongoingLabel}>Ongoing</span>}
                          {!upcoming && <span className={styles.pastLabel}>Past</span>}
                        </div>
                        <div className={styles.meetingDetails}>
                          <div className={styles.meetingTime}>
                            <strong>{date}</strong> at {time}
                          </div>
                          {meeting.clientEmail && (
                            <div className={styles.clientInfo}>
                              Email: {meeting.clientEmail}
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
                        {upcoming && (meeting.videoUrl || meeting.zoomMeetingId) && (
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

        {activeTab === 'past' && (
          <div className={styles.pastMeetings}>
            {pastMeetings.length === 0 ? (
              <p className={styles.emptyState}>No past meetings</p>
            ) : (
              <div className={styles.meetingsList}>
                {pastMeetings.map(meeting => {
                  const { date, time } = formatDateTime(meeting.start);
                  
                  return (
                    <div key={meeting.id} className={`${styles.meetingCard} ${styles.pastMeeting}`}>
                      <div className={styles.meetingInfo}>
                        <div className={styles.meetingTitle}>
                          <h5>{meeting.summary}</h5>
                          {meeting.clientName && meeting.clientName !== meeting.summary && (
                            <div className={styles.clientSubtitle}>
                              Client: {meeting.clientName}
                            </div>
                          )}
                          <span className={styles.pastLabel}>Completed</span>
                        </div>
                        <div className={styles.meetingDetails}>
                          <div className={styles.meetingTime}>
                            <strong>{date}</strong> at {time}
                          </div>
                          {meeting.clientEmail && (
                            <div className={styles.clientInfo}>
                              Email: {meeting.clientEmail}
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
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDeleteMeeting(meeting.id)}
                          title="Delete meeting record"
                        >
                          🗑️ Delete
                        </button>
                        {meeting.zoomMeetingId && (
                          <div className={styles.zoomInfo}>
                            Zoom ID: {meeting.zoomMeetingId}
                          </div>
                        )}
                        {meeting.videoUrl && (
                          <div className={styles.meetingLink}>
                            Meeting URL: {meeting.videoUrl}
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
      
      {/* Reschedule Modal */}
      {showRescheduleModal && meetingToReschedule && (
        <ScheduleAppointmentModal
          open={showRescheduleModal}
          onClose={() => {
            setShowRescheduleModal(false);
            setMeetingToReschedule(null);
          }}
          onScheduled={async (newEvent) => {
            // For reschedule, we need to delete the old meeting and create new one
            try {
              // Delete the old meeting first
              await http.del(`/api/meetings/${meetingToReschedule.id}`);
            } catch (error) {
              console.warn('Failed to delete original meeting during reschedule:', error);
            }
            
            // No need to manually refresh - context will auto-update
            setShowRescheduleModal(false);
            setMeetingToReschedule(null);
            if (onMeetingUpdate) onMeetingUpdate();
          }}
          defaultDate={new Date(meetingToReschedule.start).toISOString().split('T')[0]}
          defaultTitle={meetingToReschedule.summary}
          defaultClientName={meetingToReschedule.clientName || ''}
          defaultDescription={meetingToReschedule.description || ''}
          defaultLocation={meetingToReschedule.location || ''}
          defaultVideoUrl={meetingToReschedule.videoUrl || ''}
          defaultTime={new Date(meetingToReschedule.start).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
          defaultLength={Math.round((new Date(meetingToReschedule.end).getTime() - new Date(meetingToReschedule.start).getTime()) / (1000 * 60))}
          excludeEventId={meetingToReschedule.id}
        />
      )}
    </div>
  );
};