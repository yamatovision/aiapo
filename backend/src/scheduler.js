// scheduler.js

console.log('\n=== Scheduler Initialization ===');
console.log('1. Module loading started');
console.log('2. Time:', new Date().toISOString());
console.log('===================================\n');

import cron from 'node-cron';
import emailSchedulerService from './modules/email/email-scheduler.service.js';
import lineScheduler from './modules/line/line.scheduler.js';
import lineRetryService from './modules/line/line-retry.service.js';
import calendarService from './modules/calendar/calendar.service.js';
import googleCalendarConfig from './config/google-calendar.js';
import { Reservation, CalendarSync } from './modules/calendar/calendar.model.js';

// ヘルスチェック用変数
let lastSuccessfulRun = {
  email: new Date(),
  line: new Date(),
  calendar: new Date()
};

// メールスケジューラー（1分間隔）
cron.schedule('*/1 * * * *', async () => {
  const startTime = new Date();
  console.log('\n=== Starting Email Schedule Check ===');
  console.log('Time:', startTime.toISOString());

  try {
    const results = await emailSchedulerService.checkAndSendScheduledEmails();
    lastSuccessfulRun.email = new Date();
    
    console.log('Check completed:', {
      duration: `${new Date() - startTime}ms`,
      sent: results.sent,
      failed: results.failed
    });
  } catch (error) {
    console.error('Error in email scheduled task:', error);
  }

  console.log('=== Email Check Completed ===\n');
});

// 失敗したメールの再試行（1時間間隔）
cron.schedule('0 * * * *', async () => {
  console.log('Running failed emails retry:', new Date().toISOString());
  try {
    await emailSchedulerService.retryFailedEmails();
  } catch (error) {
    console.error('Error in email retry task:', error);
  }
});

// LINEリマインダー処理
cron.schedule('*/1 * * * *', async () => {
  const startTime = new Date();
  console.log('\n=== Starting LINE Reminder Check ===');
  console.log('Time:', startTime.toISOString());

  try {
    const results = await lineScheduler.checkAndSendReminders();
    lastSuccessfulRun.line = new Date();
    
    console.log('Check completed:', {
      duration: `${new Date() - startTime}ms`,
      sent: results.sent,
      failed: results.failed,
      skipped: results.skipped
    });
  } catch (error) {
    console.error('Error in LINE reminder task:', error);
  }

  console.log('=== LINE Check Completed ===\n');
});

// LINE失敗メッセージの再試行（既存の1時間間隔はそのまま）
cron.schedule('0 * * * *', async () => {
  const startTime = new Date();
  console.log('\n=== Starting LINE Retry Process ===');
  console.log('Time:', startTime.toISOString());

  try {
    const results = await lineRetryService.retryFailedMessages();
    console.log('Retry completed:', {
      duration: `${new Date() - startTime}ms`,
      retried: results.retried,
      succeeded: results.succeeded,
      failed: results.failed
    });
  } catch (error) {
    console.error('Error in LINE retry task:', error);
  }

  console.log('=== LINE Retry Completed ===\n');
});

cron.schedule('*/5 * * * *', async () => {
  const startTime = new Date();
  console.log('\n=== Starting Google Calendar Sync ===');
  console.log('Time:', startTime.toISOString());

  try {
    const syncConfigs = await CalendarSync.find({
      syncEnabled: true,
      syncStatus: 'active'
    });

    console.log('Found active sync configs:', syncConfigs.length);

    for (const syncData of syncConfigs) {
      try {
        console.log(`Processing sync for client: ${syncData.clientId}`);
        
        // 1. トークンの検証と更新
        const { accessToken } = await calendarService.ensureValidToken(syncData);
        console.log('Token validated successfully');

        // 2. 未同期の予約をGoogle Calendarに同期
        const unsyncedReservations = await Reservation.find({
          googleCalendarEventId: { $exists: false },
          status: { $ne: 'cancelled' },
          datetime: { $gte: new Date() }
        }).sort({ datetime: 1 }).limit(5);

        console.log(`Processing ${unsyncedReservations.length} unsynced reservations`);

        for (const reservation of unsyncedReservations) {
          try {
            const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
            // ... 予約の同期処理（既存のコード）
          } catch (error) {
            console.error(`Failed to sync reservation ${reservation._id}:`, error);
          }
        }

        // 3. Google CalendarからAiApoへの同期（ブロック作成）
        await calendarService.syncGoogleCalendarToAiApo(syncData.clientId);
        
        // 4. 既存の予約の更新確認
        await calendarService.syncGoogleCalendarEvents(syncData.clientId);

        console.log(`Completed sync for client: ${syncData.clientId}`);

      } catch (error) {
        console.error('Sync failed for client:', {
          clientId: syncData.clientId,
          error: error.message
        });
        
        await CalendarSync.findOneAndUpdate(
          { clientId: syncData.clientId },
          {
            $set: {
              syncStatus: 'error',
              error: {
                message: error.message,
                timestamp: new Date()
              }
            }
          }
        );
      }
    }

    lastSuccessfulRun.calendar = new Date();
    console.log('Calendar sync completed:', {
      duration: `${new Date() - startTime}ms`,
      processedConfigs: syncConfigs.length
    });
  } catch (error) {
    console.error('Error in calendar sync task:', error);
  }

  console.log('=== Calendar Sync Completed ===\n');
});





cron.schedule('*/5 * * * *', async () => {
  const startTime = new Date();
  console.log('\n=== Starting Google Calendar Sync ===');
  console.log('Time:', startTime.toISOString());

  try {
    // アクティブな同期設定を取得
    const syncConfigs = await CalendarSync.find({
      syncEnabled: true,
      syncStatus: 'active'
    });

    console.log('Found active sync configs:', syncConfigs.length);

    for (const syncData of syncConfigs) {
      try {
        console.log(`Processing sync for client: ${syncData.clientId}`);
        
        // トークンの検証と更新
        const { accessToken, tokenExpiryDate } = await calendarService.ensureValidToken(syncData);
        console.log('Token validated successfully');

        // 未同期の予約を取得
        const unsyncedReservations = await Reservation.find({
          googleCalendarEventId: { $exists: false },
          status: { $ne: 'cancelled' },
          datetime: { $gte: new Date() }
        }).sort({ datetime: 1 }).limit(5);

        console.log(`Processing ${unsyncedReservations.length} unsynced reservations for client ${syncData.clientId}`);

        // 予約の同期処理
        for (const reservation of unsyncedReservations) {
          try {
            const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
            const event = {
              summary: `予約: ${reservation.customerInfo.name}様`,
              description: `
                会社名: ${reservation.customerInfo.company || '未設定'}
                電話番号: ${reservation.customerInfo.phone || '未設定'}
                メール: ${reservation.customerInfo.email}
                備考: ${reservation.customerInfo.message || 'なし'}
              `.trim(),
              start: {
                dateTime: new Date(reservation.datetime).toISOString(),
                timeZone: 'Asia/Tokyo',
              },
              end: {
                dateTime: new Date(new Date(reservation.datetime).getTime() + 60*60*1000).toISOString(),
                timeZone: 'Asia/Tokyo',
              },
              transparency: 'opaque',
              visibility: 'private',
              reminders: {
                useDefault: true
              }
            };

            const response = await calendar.events.insert({
              calendarId: syncData.calendarId,
              resource: event,
            });

            await Reservation.findByIdAndUpdate(reservation._id, {
              googleCalendarEventId: response.data.id
            });

            console.log(`Successfully synced reservation ${reservation._id}`);
          } catch (error) {
            console.error(`Failed to sync reservation ${reservation._id}:`, error);
          }
        }

        // 既存の予約の更新確認
        await calendarService.syncGoogleCalendarEvents(syncData.clientId);
        console.log(`Completed sync for client: ${syncData.clientId}`);

      } catch (error) {
        console.error('Sync failed for client:', {
          clientId: syncData.clientId,
          error: error.message
        });
        
        // 同期エラーを記録
        await CalendarSync.findOneAndUpdate(
          { clientId: syncData.clientId },
          {
            $set: {
              syncStatus: 'error',
              error: {
                message: error.message,
                timestamp: new Date()
              }
            }
          }
        );
      }
    }

    lastSuccessfulRun.calendar = new Date();
    console.log('Calendar sync completed:', {
      duration: `${new Date() - startTime}ms`,
      processedConfigs: syncConfigs.length
    });
  } catch (error) {
    console.error('Error in calendar sync task:', error);
  }

  console.log('=== Calendar Sync Completed ===\n');
});

// ヘルスチェックエンドポイント用のステータス取得関数
export const getSchedulerStatus = () => {
  const now = new Date();
  return {
    email: {
      lastRun: lastSuccessfulRun.email,
      status: now - lastSuccessfulRun.email < 120000 ? 'healthy' : 'delayed'
    },
    line: {
      lastRun: lastSuccessfulRun.line,
      status: now - lastSuccessfulRun.line < 360000 ? 'healthy' : 'delayed'
    },
    calendar: {
      lastRun: lastSuccessfulRun.calendar,
      status: now - lastSuccessfulRun.calendar < 360000 ? 'healthy' : 'delayed'
    }
  };
};

console.log('Scheduler started with enhanced monitoring');