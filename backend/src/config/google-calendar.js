
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

class GoogleCalendarConfig {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async refreshAccessToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return {
        accessToken: credentials.access_token,
        expiryDate: new Date(credentials.expiry_date)
      };
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  async validateToken(accessToken, refreshToken, expiryDate) {
    try {
      // トークンの有効期限が切れる5分前から更新を行う
      const tokenExpiring = new Date(expiryDate).getTime() - Date.now() <= 300000;
      
      if (tokenExpiring) {
        return await this.refreshAccessToken(refreshToken);
      }
      
      return { accessToken, expiryDate };
    } catch (error) {
      console.error('Token validation failed:', error);
      throw error;
    }
  }

  getCalendarInstance(accessToken) {
    this.oauth2Client.setCredentials({
      access_token: accessToken
    });
    
    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }
}

export default new GoogleCalendarConfig();