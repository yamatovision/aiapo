import { CalendarSync, Reservation } from '../modules/calendar/calendar.model.js';
import calendarService from '../modules/calendar/calendar.service.js';
import googleCalendarConfig from '../config/google-calendar.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function testCalendarSync() {
  try {
    console.log('=== Starting Calendar Sync Test ===');

    // データベース接続
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. 同期設定の確認
    const syncData = await CalendarSync.findOne({ 
      clientId: 'default',
      syncEnabled: true,
      syncStatus: 'active'
    });

    console.log('\nSync Configuration:', {
      exists: !!syncData,
      calendarId: syncData?.calendarId,
      syncStatus: syncData?.syncStatus,
      lastSyncTime: syncData?.lastSyncTime,
      auth: syncData?.auth ? {
        hasAccessToken: !!syncData.auth.accessToken,
        tokenExpiryDate: syncData.auth.tokenExpiryDate
      } : null
    });

    if (!syncData) {
      throw new Error('No active sync configuration found');
    }

    // 2. トークンの検証
    console.log('\nValidating token...');
    const { accessToken } = await calendarService.ensureValidToken(syncData);
    console.log('Token validation successful');

    // 3. ローカル予約の取得
    const localReservations = await Reservation.find({
      datetime: { $gte: new Date() },
      status: { $ne: 'cancelled' }
    }).lean();

    console.log('\nLocal Reservations:', {
      count: localReservations.length,
      details: localReservations.map(r => ({
        id: r._id,
        datetime: r.datetime,
        status: r.status,
        customerName: r.customerInfo.name,
        googleEventId: r.googleCalendarEventId
      }))
    });

    // 4. Googleカレンダーのイベント取得
    const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
    const response = await calendar.events.list({
      calendarId: syncData.calendarId,
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      fields: 'items(id,summary,start,end,status)', // 必要なフィールドを明示的に指定
      maxResults: 2500 // 必要に応じて調整
    });
    
    console.log('\nGoogle Calendar Events:', {
      count: response.data.items.length,
      details: response.data.items.map(e => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date, // 終日イベントにも対応
        status: e.status
      }))
    });

    // 5. 同期状態の比較と問題の特定
    const syncIssues = [];
    
    // 5.1 ローカル予約がGoogleカレンダーに存在するか確認
    for (const reservation of localReservations) {
      if (reservation.googleCalendarEventId) {
        const googleEvent = response.data.items.find(e => 
          e.id === reservation.googleCalendarEventId);
        
        if (!googleEvent) {
          syncIssues.push({
            type: 'missing_in_google',
            severity: 'high',
            reservationId: reservation._id,
            googleEventId: reservation.googleCalendarEventId,
            details: 'Reservation exists locally but not in Google Calendar'
          });
        } else {
          // 日時の比較
          const localTime = new Date(reservation.datetime).getTime();
          const googleTime = new Date(googleEvent.start.dateTime).getTime();
          
          if (localTime !== googleTime) {
            syncIssues.push({
              type: 'time_mismatch',
              severity: 'medium',
              reservationId: reservation._id,
              googleEventId: googleEvent.id,
              details: {
                localTime: reservation.datetime,
                googleTime: googleEvent.start.dateTime
              }
            });
          }
        }
      } else {
        syncIssues.push({
          type: 'no_google_id',
          severity: 'high',
          reservationId: reservation._id,
          details: 'Local reservation has no Google Calendar event ID'
        });
      }
    }

    // 5.2 Googleカレンダーのイベントがローカルに存在するか確認
    for (const event of response.data.items) {
      const localReservation = localReservations.find(r => 
        r.googleCalendarEventId === event.id);
      
      if (!localReservation && event.summary.includes('予約:')) {
        syncIssues.push({
          type: 'missing_in_local',
          severity: 'high',
          googleEventId: event.id,
          details: 'Google Calendar event exists but no local reservation found'
        });
      }
    }

    // 6. 問題の報告
    console.log('\nSync Issues:', {
      totalIssues: syncIssues.length,
      highSeverity: syncIssues.filter(i => i.severity === 'high').length,
      mediumSeverity: syncIssues.filter(i => i.severity === 'medium').length,
      details: syncIssues
    });

    // 7. 修正が必要な項目の提案
    if (syncIssues.length > 0) {
      console.log('\nRecommended Actions:');
      for (const issue of syncIssues) {
        switch (issue.type) {
          case 'missing_in_google':
            console.log(`- Recreate Google Calendar event for reservation ${issue.reservationId}`);
            break;
          case 'no_google_id':
            console.log(`- Create Google Calendar event for reservation ${issue.reservationId}`);
            break;
          case 'missing_in_local':
            console.log(`- Investigate Google Calendar event ${issue.googleEventId}`);
            break;
          case 'time_mismatch':
            console.log(`- Synchronize times for reservation ${issue.reservationId}`);
            break;
        }
      }
    } else {
      console.log('\nNo sync issues found. All systems are in sync.');
    }

    console.log('\n=== Calendar Sync Test Completed ===');

  } catch (error) {
    console.error('\nTest failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// スクリプトの実行
testCalendarSync();

