/**
 * Zoom API Service
 * Handles creating and managing Zoom meetings using Server-to-Server OAuth authentication
 */

import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

interface ZoomMeetingRequest {
  topic: string;
  start_time: string; // ISO string in UTC
  duration: number; // minutes
  timezone?: string;
  agenda?: string;
  password?: string;
}

interface ZoomMeetingResponse {
  id: number;
  host_id: string;
  topic: string;
  type: number;
  status: string;
  start_time: string;
  duration: number;
  timezone: string;
  agenda: string;
  created_at: string;
  start_url: string;
  join_url: string;
  password: string;
  h323_password: string;
  pstn_password: string;
  encrypted_password: string;
  uuid: string;
  host_email: string;
}

interface ZoomOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class ZoomService {
  private readonly baseUrl = 'https://api.zoom.us/v2';
  private readonly oauthUrl = 'https://zoom.us/oauth/token';
  private readonly accountId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  
  // Cache access token
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.accountId = process.env.ZOOM_ACCOUNT_ID || '';
    this.clientId = process.env.ZOOM_CLIENT_ID || '';
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET || '';
    
    if (!this.accountId || !this.clientId || !this.clientSecret) {
      console.warn('[Zoom] OAuth credentials not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET environment variables.');
    }
  }

  /**
   * Get OAuth access token (cached)
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < (this.tokenExpiry - 60000)) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post<ZoomOAuthTokenResponse>(
        this.oauthUrl,
        new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: this.accountId
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('[Zoom] OAuth token refreshed, expires in:', response.data.expires_in, 'seconds');
      
      return this.accessToken;

    } catch (error: any) {
      console.error('[Zoom] Failed to get OAuth token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Zoom API');
    }
  }

  /**
   * Check if Zoom API is properly configured
   */
  public isConfigured(): boolean {
    return !!(this.accountId && this.clientId && this.clientSecret);
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(params: {
    topic: string;
    startTime: Date;
    duration: number; // minutes
    agenda?: string;
    timezone?: string;
  }): Promise<{ success: boolean; meeting?: ZoomMeetingResponse; error?: string }> {
    
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Zoom API not configured. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.'
      };
    }

    try {
      const token = await this.getAccessToken();
      
      // Format start time as ISO string
      const startTimeISO = dayjs(params.startTime).utc().format('YYYY-MM-DDTHH:mm:ss[Z]');
      
      const meetingData: ZoomMeetingRequest = {
        topic: params.topic,
        start_time: startTimeISO,
        duration: params.duration,
        timezone: params.timezone || 'America/Denver',
        agenda: params.agenda || `Consultation meeting: ${params.topic}`,
        password: this.generateMeetingPassword()
      };

      console.log('[Zoom] Creating meeting:', {
        topic: meetingData.topic,
        start_time: meetingData.start_time,
        duration: meetingData.duration,
        timezone: meetingData.timezone
      });

      const response = await axios.post(
        `${this.baseUrl}/users/me/meetings`,
        meetingData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[Zoom] Meeting created successfully:', {
        id: response.data.id,
        join_url: response.data.join_url
      });

      return {
        success: true,
        meeting: response.data
      };

    } catch (error: any) {
      console.error('[Zoom] Failed to create meeting:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to create Zoom meeting'
      };
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(meetingId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Zoom API not configured'
      };
    }

    try {
      const token = await this.getAccessToken();
      
      await axios.delete(
        `${this.baseUrl}/meetings/${meetingId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('[Zoom] Meeting deleted successfully:', meetingId);
      
      return { success: true };

    } catch (error: any) {
      console.error('[Zoom] Failed to delete meeting:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to delete Zoom meeting'
      };
    }
  }

  /**
   * Generate a random meeting password
   */
  private generateMeetingPassword(): string {
    // Generate 6-digit numeric password
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get meeting info
   */
  async getMeeting(meetingId: string): Promise<{ success: boolean; meeting?: ZoomMeetingResponse; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Zoom API not configured'
      };
    }

    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseUrl}/meetings/${meetingId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return {
        success: true,
        meeting: response.data
      };

    } catch (error: any) {
      console.error('[Zoom] Failed to get meeting:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to get Zoom meeting'
      };
    }
  }
}

// Export singleton instance
export const zoomService = new ZoomService();