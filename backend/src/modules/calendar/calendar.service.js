import { google } from 'googleapis';
import { Reservation, CalendarSync, BusinessHours } from './calendar.model.js';
import { Settings } from '../settings/settings.model.js';  // Settingsモデルをインポート
import { EmailTemplate } from '../email/email.model.js';
import googleCalendarConfig from '../../config/google-calendar.js';  // これを追加
import { isSameDay } from 'date-fns';
import { LineUser } from '../line/line.model.js';  // これを追加
import lineService from '../line/line.service.js';




import emailSchedulerService from '../email/email-scheduler.service.js';

class CalendarService {
  constructor() {

  }

  // Google Calendar認証・同期関連の機能
  async generateAuthUrl(clientId) {
    try {
      const authUrl = googleCalendarConfig.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar'],
        state: clientId,
        prompt: 'consent'
      });
      return authUrl;
    } catch (error) {
      console.error('Failed to generate auth URL:', error);
      throw new Error('Failed to generate authentication URL');
    }
  }
  async initializeSync(accessToken, expiresIn) {
    try {
      console.log('Initializing calendar sync with token');
  
      // OAuth2クライアントの設定
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
  
      // アクセストークンを設定
      oauth2Client.setCredentials({
        access_token: accessToken
      });
  
      // Google Calendar APIのクライアントを初期化
      const calendar = google.calendar({ 
        version: 'v3', 
        auth: oauth2Client
      });
  
      try {
        // カレンダー一覧を取得して主要カレンダーを見つける
        const calendarList = await calendar.calendarList.list();
        console.log('Successfully fetched calendar list');
        
        const primaryCalendar = calendarList.data.items.find(cal => cal.primary);
  
        if (!primaryCalendar) {
          throw new Error('Primary calendar not found');
        }
  
        // OAuth2クライアントから認証情報を取得
        const tokens = oauth2Client.credentials;
        
        // トークンの有効期限を計算
        const tokenExpiryDate = new Date(Date.now() + (expiresIn * 1000));
  
        // 同期状態をデータベースに保存
        const syncData = await CalendarSync.findOneAndUpdate(
          { clientId: 'default' },
          {
            calendarId: primaryCalendar.id,
            syncEnabled: true,
            lastSyncTime: new Date(),
            syncStatus: 'active',
            auth: {
              accessToken: accessToken,
              refreshToken: tokens.refresh_token, // リフレッシュトークンを保存
              tokenExpiryDate: tokenExpiryDate
            }
          },
          { upsert: true, new: true }
        );
  
        console.log('Calendar sync initialized successfully');
  
        return {
          success: true,
          syncStatus: 'active',
          calendarId: primaryCalendar.id,
          calendarName: primaryCalendar.summary
        };
  
      } catch (apiError) {
        console.error('Google Calendar API error:', apiError);
        throw new Error(`Google Calendar API error: ${apiError.message}`);
      }
  
    } catch (error) {
      console.error('Failed to initialize calendar sync:', error);
      
      await CalendarSync.findOneAndUpdate(
        { clientId: 'default' },
        {
          syncStatus: 'error',
          error: {
            message: error.message,
            timestamp: new Date()
          }
        },
        { upsert: true }
      );
  
      throw error;
    }
  }

  async completeSyncSetup(code, clientId) {
    try {
      // トークン取得
      const { tokens } = await googleCalendarConfig.oauth2Client.getToken(code);
      
      // カレンダー一覧を取得
      const calendar = googleCalendarConfig.getCalendarInstance(tokens.access_token);
      const calendarList = await calendar.calendarList.list();
      const primaryCalendar = calendarList.data.items.find(cal => cal.primary);

      if (!primaryCalendar) {
        throw new Error('Primary calendar not found');
      }

      // 同期状態を保存
      const syncData = await CalendarSync.findOneAndUpdate(
        { clientId },
        {
          calendarId: primaryCalendar.id,
          syncEnabled: true,
          lastSyncTime: new Date(),
          syncStatus: 'active',
          auth: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiryDate: new Date(tokens.expiry_date)
          }
        },
        { upsert: true, new: true }
      );

      return {
        success: true,
        syncStatus: syncData.syncStatus,
        calendarId: syncData.calendarId
      };
    } catch (error) {
      console.error('Sync setup failed:', error);
      throw error;
    }
  }
  


  async syncGoogleCalendarToAiApo(clientId) {
    try {
      console.log('=== Starting Google Calendar to AiApo sync ===');
      console.log('Client:', clientId);
      
      const syncData = await CalendarSync.findOne({
        clientId,
        syncEnabled: true,
        syncStatus: 'active'
      });
  
      if (!syncData) {
        console.log('No active sync configuration found');
        return;
      }
  
      // トークンの検証と更新
      const { accessToken } = await this.ensureValidToken(syncData);
      const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
  
      // 現在の日時から1ヶ月分の予定を取得
      const now = new Date();
      const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
      console.log('Fetching events:', {
        timeMin: now.toISOString(),
        timeMax: oneMonthLater.toISOString(),
        calendarId: syncData.calendarId
      });
  
      // Googleカレンダーのイベントを取得
      const response = await calendar.events.list({
        calendarId: syncData.calendarId,
        timeMin: now.toISOString(),
        timeMax: oneMonthLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100
      });
      console.log('=== Google Calendar API Response ===');
console.log('Total events:', response.data.items.length);
response.data.items.forEach(event => {
  console.log('Event details:', {
    id: event.id,
    summary: event.summary,
    start: event.start,
    end: event.end,
    status: event.status,
    created: event.created,
    updated: event.updated,
    creator: event.creator,
    organizer: event.organizer,
    // その他の属性も必要に応じて
  });
});
  
      const events = response.data.items;
      console.log(`Found ${events.length} events`);
  
      // 既存のブロックを一旦クリア
      await BusinessHours.updateOne(
        { clientId },
        {
          $pull: {
            exceptionalDays: {
              googleEventId: { $exists: true }
            }
          }
        }
      );
  
      for (const event of events) {
        try {
          console.log('Processing event:', {
            summary: event.summary,
            start: event.start,
            end: event.end,
            isAllDay: !event.start.dateTime
          });
  
          if (event.summary && event.summary.startsWith('予約:')) {
            // 予約イベントの処理
            let reservation = await Reservation.findOne({
              googleCalendarEventId: event.id
            });
  
            if (!reservation) {
              // 新規予約として追加
              const customerInfo = this.extractCustomerInfoFromDescription(event.description);
              reservation = new Reservation({
                clientId,
                datetime: new Date(event.start.dateTime || event.start.date),
                status: 'confirmed',
                customerInfo,
                googleCalendarEventId: event.id,
                createdAt: new Date(event.created),
                updatedAt: new Date(event.updated)
              });
              await reservation.save();
              console.log(`New reservation created: ${reservation._id}`);
            } else {
              // 既存の予約を更新
              reservation.datetime = new Date(event.start.dateTime || event.start.date);
              reservation.status = event.status === 'cancelled' ? 'cancelled' : 'confirmed';
              await reservation.save();
              console.log(`Updated reservation: ${reservation._id}`);
            }
          } else {
            // 通常の予定の処理
            // 終日イベントかどうかを判定
            const isAllDay = !event.start.dateTime;
            const startTime = new Date(event.start.dateTime || event.start.date);
            const endTime = new Date(event.end.dateTime || event.end.date);
  
            // 終日イベントの場合は営業時間外の予定として扱う
            if (!isAllDay) {
              await BusinessHours.findOneAndUpdate(
                { clientId },
                {
                  $push: {
                    'exceptionalDays': {
                      date: startTime,
                      endTime: endTime,
                      isBlocked: true,
                      note: `Blocked by Google Calendar: ${event.summary}`,
                      googleEventId: event.id
                    }
                  }
                }
              );
              console.log(`Added block for event: ${event.summary}`, {
                start: startTime,
                end: endTime
              });
            } else {
              console.log(`Skipping all-day event: ${event.summary}`);
            }
          }
        } catch (eventError) {
          console.error('Error processing event:', {
            eventId: event.id,
            error: eventError.message
          });
        }
      }
  
      // 同期時刻の更新
      await CalendarSync.findOneAndUpdate(
        { clientId },
        {
          lastSyncTime: now,
          $unset: { error: 1 }
        }
      );
  
      console.log('Sync completed successfully');
  
    } catch (error) {
      console.error('Sync failed:', error);
      
      // エラー状態を記録
      await CalendarSync.findOneAndUpdate(
        { clientId },
        {
          syncStatus: 'error',
          error: {
            message: error.message,
            timestamp: new Date()
          }
        }
      );
      
      throw error;
    }
  }








  
  
  // 補助メソッド：イベントの説明から顧客情報を抽出
  extractCustomerInfoFromDescription(description) {
    if (!description) {
      return {
        name: '（名前なし）',
        email: 'no-email@example.com',
        phone: '',
        company: '',
        message: ''
      };
    }
  
    const lines = description.split('\n');
    const customerInfo = {
      name: '（名前なし）',
      email: 'no-email@example.com',
      phone: '',
      company: '',
      message: ''
    };
  
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.includes('会社名:')) {
        customerInfo.company = trimmedLine.split(':')[1].trim();
      } else if (trimmedLine.includes('電話番号:')) {
        customerInfo.phone = trimmedLine.split(':')[1].trim();
      } else if (trimmedLine.includes('メール:')) {
        customerInfo.email = trimmedLine.split(':')[1].trim();
      } else if (trimmedLine.includes('備考:')) {
        customerInfo.message = trimmedLine.split(':')[1].trim();
      }
    });
  
    return customerInfo;
  }



  
  async ensureValidToken(syncData) {
    if (!syncData || !syncData.auth) {
      throw new Error('Calendar sync not configured');
    }
  
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
  
      // 現在の認証情報を設定
      oauth2Client.setCredentials({
        access_token: syncData.auth.accessToken,
        refresh_token: syncData.auth.refreshToken,
        expiry_date: new Date(syncData.auth.tokenExpiryDate).getTime()
      });
  
      // トークンの有効期限をチェック
      const now = Date.now();
      const expiryDate = new Date(syncData.auth.tokenExpiryDate).getTime();
      const isExpired = expiryDate <= now + 300000; // 5分前から更新
  
      if (isExpired) {
        console.log('Token is expired or expiring soon, refreshing...');
        
        if (!syncData.auth.refreshToken) {
          throw new Error('Refresh token is not available');
        }
  
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // データベースの更新
        await CalendarSync.findOneAndUpdate(
          { clientId: syncData.clientId },
          {
            $set: {
              'auth.accessToken': credentials.access_token,
              'auth.tokenExpiryDate': new Date(credentials.expiry_date)
            }
          }
        );
  
        return {
          accessToken: credentials.access_token,
          tokenExpiryDate: new Date(credentials.expiry_date)
        };
      }
  
      return {
        accessToken: syncData.auth.accessToken,
        tokenExpiryDate: new Date(syncData.auth.tokenExpiryDate)
      };
  
    } catch (error) {
      console.error('Token validation failed:', error);
      throw error;
    }
  }
  
  
  










  
  async getSyncStatus(clientId) {
    try {
      const syncData = await CalendarSync.findOne({ clientId });
      return syncData || { syncStatus: 'disconnected' };
    } catch (error) {
      console.error('Failed to get sync status:', error);
      throw error;
    }
  }

  async disconnectSync(clientId) {
    try {
      await CalendarSync.findOneAndUpdate(
        { clientId },
        {
          syncEnabled: false,
          syncStatus: 'disconnected',
          lastSyncTime: new Date(),
          error: null
        }
      );
    } catch (error) {
      console.error('Failed to disconnect sync:', error);
      throw error;
    }
  }

  // 既存の予約管理機能
  async getReservations(filters = {}) {
    try {
      const query = { ...filters };
      return await Reservation.find(query).sort({ datetime: -1 });
    } catch (error) {
      console.error('Error in getReservations:', error);
      throw error;
    }
  }

  async getReservationById(reservationId) {
    try {
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
      return reservation;
    } catch (error) {
      console.error('Error in getReservationById:', error);
      throw error;
    }
  }

  

  async getAvailableSlots(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
  
      // BusinessHoursの設定を取得
      const businessHours = await BusinessHours.findOne({ clientId: 'default' });
      if (!businessHours) {
        throw new Error('Business hours settings not found');
      }
  
      // 曜日の取得と営業時間の確認
      const dayOfWeek = startOfDay.toLocaleLowerCase('en-US', { weekday: 'long' });
      const dayConfig = businessHours.businessHours[dayOfWeek];
  
      // その日が営業日でない場合は空配列を返す
      if (!dayConfig.isOpen) {
        return [];
      }
  
      // 予約済み時間を取得
      const reservations = await Reservation.find({
        datetime: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        status: { $in: ['confirmed', 'pending'] }
      });
  
      // Google Calendar連携の確認と予定取得
      let googleEvents = [];
      const syncData = await CalendarSync.findOne({ 
        clientId: 'default',
        syncEnabled: true,
        syncStatus: 'active'
      });
  
      if (syncData) {
        try {
          const { accessToken } = await this.ensureValidToken(syncData);
          const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
          const response = await calendar.events.list({
            calendarId: syncData.calendarId,
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true
          });
  
          googleEvents = response.data.items;
        } catch (error) {
          console.warn('Failed to fetch Google Calendar events:', error);
        }
      }
  
      // 予約済み時間のセット作成
      const bookedTimes = new Set(
        reservations.map(r => r.datetime.getHours())
      );
  
      // ブロックされた時間帯の確認
      const blockedSlots = businessHours.exceptionalDays?.filter(day => {
        const dayStart = new Date(day.date);
        dayStart.setHours(0, 0, 0, 0);
        const targetDayStart = new Date(date);
        targetDayStart.setHours(0, 0, 0, 0);
        return dayStart.getTime() === targetDayStart.getTime() && day.isBlocked;
      }) || [];
  
      // 利用可能な時間枠を生成
      const availableSlots = [];
      const [startHour] = dayConfig.start.split(':').map(Number);
      const [endHour] = dayConfig.end.split(':').map(Number);
  
      for (let hour = startHour; hour < endHour; hour++) {
        const slotTime = new Date(date);
        slotTime.setHours(hour, 0, 0, 0);
  
        // この時間枠がブロックされているか確認
        const isBlocked = blockedSlots.some(blocked => {
          const blockStart = new Date(blocked.date);
          const blockEnd = new Date(blocked.endTime);
          return slotTime >= blockStart && slotTime < blockEnd;
        });
  
        // Googleカレンダーのイベントによるブロックを確認
        const isBlockedByGoogleEvent = googleEvents.some(event => {
          if (event.summary && event.summary.startsWith('予約:')) {
            return false; // 予約イベントはスキップ
          }
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);
          return slotTime >= eventStart && slotTime < eventEnd;
        });
  
        if (!isBlocked && !isBlockedByGoogleEvent && !bookedTimes.has(hour)) {
          availableSlots.push({
            time: `${hour.toString().padStart(2, '0')}:00`,
            available: true
          });
        }
      }
  
      return availableSlots;
    } catch (error) {
      console.error('Error in getAvailableSlots:', error);
      throw error;
    }
  }


  async createReservation(reservationData) {
    try {
      // 1. LINE連携状態の確認とセットアップ
      let lineUserId = null;
      if (reservationData.customerInfo?.email) {
        const lineUser = await LineUser.findOne({
          email: reservationData.customerInfo.email,
          status: 'active'
        });
  
        if (lineUser) {
          lineUserId = lineUser.lineUserId;
          // LINE連携情報とリマインド設定を同時に追加
          reservationData.lineConnection = {
            status: 'connected',
            lineUserId: lineUser.lineUserId,
            connectedAt: new Date()
          };
          reservationData.lineNotification = {
            enabled: true,
            shortTermReminderSent: false,
            longTermReminderSent: false
          };
        
        }
      }
  
      // 2. 予約の作成
      const reservation = new Reservation(reservationData);
      await reservation.save();
      console.log('New reservation created:', {
        id: reservation._id,
        datetime: reservation.datetime,
        customerEmail: reservation.customerInfo.email,
        lineConnection: reservation.lineConnection
      });
  
      // 3. LINE連携が確認できた場合、確認メッセージを送信
      if (lineUserId) {
        try {
          await lineService.handleNewReservation(reservation);
          console.log('LINE confirmation message sent:', {
            reservationId: reservation._id,
            lineUserId: lineUserId
          });
        } catch (lineError) {
          console.error('Failed to send LINE confirmation:', lineError);
        }
      }



      // 2. メールテンプレート処理
      try {
        const templates = await EmailTemplate.find({
          $or: [
            { clientId: reservationData.clientId },
            { clientId: 'default' }
          ],
          isActive: true
        });
  
        console.log('Found active email templates:', templates.map(t => ({
          id: t._id,
          name: t.name,
          type: t.type,
          timing: t.timing
        })));
  
        // メールスケジュール作成
        for (const template of templates) {
          try {
            const schedule = await emailSchedulerService.scheduleEmail(
              template._id,
              reservation._id,
              reservation.datetime
            );
            console.log('Email scheduled:', {
              template: template.name,
              type: template.type,
              scheduledTime: schedule.scheduledTime || 'immediate',
              status: schedule.status
            });
          } catch (scheduleError) {
            console.error('Failed to schedule email:', {
              template: template.name,
              error: scheduleError.message
            });
          }
        }
      } catch (emailError) {
        console.error('Email template processing error:', emailError);
      }
  
      // 3. Google Calendar同期
      try {
        const syncData = await CalendarSync.findOne({ 
          clientId: reservationData.clientId || 'default',
          syncEnabled: true,
          syncStatus: 'active'
        });
  
        if (syncData) {
          console.log('Found active sync configuration');
          
          const { accessToken } = await this.ensureValidToken(syncData);
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
              dateTime: reservation.datetime.toISOString(),
              timeZone: 'Asia/Tokyo',
            },
            end: {
              dateTime: new Date(new Date(reservation.datetime).getTime() + 60*60*1000).toISOString(),
              timeZone: 'Asia/Tokyo',
            }, transparency: 'opaque',
            visibility: 'private',
            reminders: {
              useDefault: true
            }
          
          };
  
          console.log('Creating Google Calendar event:', event);
  
          const response = await calendar.events.insert({
            calendarId: syncData.calendarId,
            resource: event,
          });
  
          console.log('Google Calendar event created:', {
            eventId: response.data.id,
            summary: response.data.summary
          });
  
          // GoogleカレンダーのイベントIDを保存
          reservation.googleCalendarEventId = response.data.id;
          await reservation.save();
        } else {
          console.log('No active sync configuration found');
        }
      } catch (calendarError) {
        console.error('Google Calendar sync error:', calendarError);
        // エラーログは残すが、予約自体は成功させる
      }
  
      return reservation;
    } catch (error) {
      console.error('Reservation creation error:', error);
      throw error;
    }
  }












  async cancelReservation(reservationId) {
    try {
      // 1. 予約のステータス更新
      const reservation = await Reservation.findByIdAndUpdate(
        reservationId,
        { 
          status: 'cancelled',
          cancelledAt: new Date()
        },
        { new: true }
      );
  
      if (!reservation) {
        throw new Error('Reservation not found');
      }
  
      console.log('Reservation cancelled:', {
        id: reservation._id,
        datetime: reservation.datetime,
        customerEmail: reservation.customerInfo.email
      });
  
      // 2. キャンセルメール処理
      try {
        const cancelTemplates = await EmailTemplate.find({
          $or: [
            { clientId: reservation.clientId },
            { clientId: 'default' }
          ],
          isActive: true,
          type: 'cancellation'
        });
  
        console.log('Found cancellation email templates:', cancelTemplates.map(t => ({
          id: t._id,
          name: t.name,
          timing: t.timing
        })));
  
        // 既存のメールスケジュールをキャンセル
        const allTemplates = await EmailTemplate.find({
          $or: [
            { clientId: reservation.clientId },
            { clientId: 'default' }
          ],
          isActive: true
        });
  
        // 未送信の予定されたメールをキャンセル
        for (const template of allTemplates) {
          try {
            await emailSchedulerService.cancelScheduledEmails(reservation._id, template._id);
            console.log('Cancelled scheduled emails for template:', template.name);
          } catch (cancelError) {
            console.error('Failed to cancel scheduled email:', {
              template: template.name,
              error: cancelError.message
            });
          }
        }
  
        // キャンセル通知メールの送信
        for (const template of cancelTemplates) {
          try {
            const schedule = await emailSchedulerService.scheduleEmail(
              template._id,
              reservation._id,
              new Date() // キャンセルメールは即時送信
            );
            console.log('Cancellation email scheduled:', {
              template: template.name,
              status: schedule.status
            });
          } catch (scheduleError) {
            console.error('Failed to schedule cancellation email:', {
              template: template.name,
              error: scheduleError.message
            });
          }
        }
      } catch (emailError) {
        console.error('Email processing error during cancellation:', emailError);
      }
  
      // 3. Google Calendarのイベントキャンセル
      if (reservation.googleCalendarEventId) {
        try {
          const syncData = await CalendarSync.findOne({ 
            clientId: reservation.clientId,
            syncEnabled: true,
            syncStatus: 'active'
          });
  
          if (syncData) {
            // トークンの有効性を確認・更新
            const validatedSync = await this.ensureValidToken(syncData);
            console.log('Calendar sync token validated for cancellation:', {
              clientId: validatedSync.clientId,
              status: validatedSync.syncStatus
            });
  
            const calendar = googleCalendarConfig.getCalendarInstance(
              validatedSync.auth.accessToken
            );
  
            // 方法1: イベントを削除する場合
            // await calendar.events.delete({
            //   calendarId: syncData.calendarId,
            //   eventId: reservation.googleCalendarEventId
            // });
  
            // 方法2: イベントをキャンセル状態に更新する場合（履歴保持）
            const event = {
              status: 'cancelled',
              summary: `[キャンセル済] 予約: ${reservation.customerInfo.name}様`,
              colorId: '8', // グレー色に変更
              transparency: 'transparent' // 予定なしとして表示
            };
  
            await calendar.events.patch({
              calendarId: syncData.calendarId,
              eventId: reservation.googleCalendarEventId,
              resource: event
            });
  
            console.log('Google Calendar event cancelled:', {
              eventId: reservation.googleCalendarEventId
            });
          }
        } catch (calendarError) {
          console.error('Google Calendar sync error during cancellation:', calendarError);
          // カレンダー同期エラーを記録
          await CalendarSync.findOneAndUpdate(
            { clientId: reservation.clientId },
            {
              $set: {
                syncStatus: 'error',
                error: {
                  message: calendarError.message,
                  timestamp: new Date()
                }
              }
            }
          );
        }
      }
  
      // 4. LINE通知の処理（オプション）
      if (reservation.lineNotification?.enabled && reservation.lineNotification?.lineUserId) {
        try {
          await lineService.sendCancellationNotification(reservation);
          console.log('LINE cancellation notification sent');
        } catch (lineError) {
          console.error('Failed to send LINE cancellation notification:', lineError);
        }
      }
  
      return reservation;
    } catch (error) {
      console.error('Error in cancelReservation:', error);
      throw error;
    }
  }

  // calendar.service.js に追加








  async syncGoogleCalendarEvents(clientId) {
    try {
      console.log('Starting Google Calendar sync for client:', clientId);
      
      const syncData = await CalendarSync.findOne({
        clientId,
        syncEnabled: true,
        syncStatus: 'active'
      });
  
      if (!syncData) {
        console.log('No active sync configuration found for client:', clientId);
        return;
      }
  
      // トークンの有効性を確認・更新
      const { accessToken } = await this.ensureValidToken(syncData);
      const calendar = googleCalendarConfig.getCalendarInstance(accessToken);
  
      // 最後の同期時刻を取得
      const lastSyncTime = syncData.lastSyncTime || new Date(0);
      console.log('Last sync time:', lastSyncTime);
  
      // 以下、既存のコードは変更なし
      const response = await calendar.events.list({
        calendarId: syncData.calendarId,
        updatedMin: lastSyncTime.toISOString(),
        singleEvents: true,
        orderBy: 'updated'
      });

    const events = response.data.items;
    console.log('Found updated events:', events.length);

    for (const event of events) {
      try {
        // システムの予約を検索
        const reservation = await Reservation.findOne({
          googleCalendarEventId: event.id
        });

        if (!reservation) {
          // 新規イベントの場合はスキップ（システムからの同期のみ許可）
          console.log('Skipping new event from Google Calendar:', event.id);
          continue;
        }

        console.log('Processing event update:', {
          eventId: event.id,
          status: event.status,
          updated: event.updated
        });

        // イベントの状態に応じて予約を更新
        const updates = {};

        // 日時の変更をチェック
        if (event.start?.dateTime) {
          const newDateTime = new Date(event.start.dateTime);
          if (newDateTime.getTime() !== reservation.datetime.getTime()) {
            updates.datetime = newDateTime;
            console.log('DateTime changed:', {
              old: reservation.datetime,
              new: newDateTime
            });
          }
        }

        // キャンセル状態の変更をチェック
        if (event.status === 'cancelled' && reservation.status !== 'cancelled') {
          updates.status = 'cancelled';
          updates.cancelledAt = new Date();
          console.log('Reservation cancelled from Calendar');
        }

        // 変更がある場合のみ更新を実行
        if (Object.keys(updates).length > 0) {
          console.log('Updating reservation:', {
            id: reservation._id,
            updates
          });

          // 予約情報の更新
          const updatedReservation = await Reservation.findByIdAndUpdate(
            reservation._id,
            updates,
            { new: true }
          );

          // メール通知の処理
          if (updates.datetime) {
            // 日時変更の通知処理
            const dateChangeTemplates = await EmailTemplate.find({
              $or: [
                { clientId: reservation.clientId },
                { clientId: 'default' }
              ],
              isActive: true,
              type: 'date_change'
            });

            for (const template of dateChangeTemplates) {
              try {
                await emailSchedulerService.scheduleEmail(
                  template._id,
                  updatedReservation._id,
                  new Date() // 即時送信
                );
                console.log('Date change notification email scheduled');
              } catch (emailError) {
                console.error('Failed to schedule date change email:', emailError);
              }
            }
          }

          if (updates.status === 'cancelled') {
            // キャンセル通知の処理
            const cancelTemplates = await EmailTemplate.find({
              $or: [
                { clientId: reservation.clientId },
                { clientId: 'default' }
              ],
              isActive: true,
              type: 'cancellation'
            });

            for (const template of cancelTemplates) {
              try {
                await emailSchedulerService.scheduleEmail(
                  template._id,
                  updatedReservation._id,
                  new Date() // 即時送信
                );
                console.log('Cancellation notification email scheduled');
              } catch (emailError) {
                console.error('Failed to schedule cancellation email:', emailError);
              }
            }
          }

          // LINE通知の処理
          if (updatedReservation.lineNotification?.enabled && 
              updatedReservation.lineNotification?.lineUserId) {
            try {
              if (updates.datetime) {
                await lineService.sendDateChangeNotification(updatedReservation);
                console.log('LINE date change notification sent');
              }
              if (updates.status === 'cancelled') {
                await lineService.sendCancellationNotification(updatedReservation);
                console.log('LINE cancellation notification sent');
              }
            } catch (lineError) {
              console.error('Failed to send LINE notification:', lineError);
            }
          }
        }
      } catch (eventError) {
        console.error('Error processing calendar event:', {
          eventId: event.id,
          error: eventError
        });
      }
    }


















    




    // 同期状態の更新
    await CalendarSync.findOneAndUpdate(
      { clientId },
      {
        lastSyncTime: new Date(),
        $unset: { error: 1 }
      }
    );

    console.log('Calendar sync completed successfully');
  } catch (error) {
    console.error('Calendar sync failed:', error);
    // 同期エラーを記録
    await CalendarSync.findOneAndUpdate(
      { clientId },
      {
        syncStatus: 'error',
        error: {
          message: error.message,
          timestamp: new Date()
        }
      }
    );
    throw error;
  }
}

// calendar.service.jsに追加

async getAvailableCalendars(clientId = 'default') {
  try {
    const syncData = await CalendarSync.findOne({ clientId });
    if (!syncData || !syncData.auth) {
      throw new Error('Calendar sync not configured');
    }

    const { accessToken } = await this.ensureValidToken(syncData);

    // OAuth2クライアントの設定
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // アクセストークンを設定
    oauth2Client.setCredentials({
      access_token: accessToken
    });

    // Google Calendar APIのクライアントを初期化
    const calendar = google.calendar({ 
      version: 'v3', 
      auth: oauth2Client 
    });

    // カレンダー一覧を取得
    const response = await calendar.calendarList.list();
    console.log('Retrieved calendars:', response.data.items.length);

    return response.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      selected: cal.id === syncData.calendarId
    }));

  } catch (error) {
    console.error('Failed to get available calendars:', error);
    throw error;
  }
}


async updateSyncCalendar(clientId, calendarId) {
  try {
    const syncData = await CalendarSync.findOneAndUpdate(
      { clientId },
      { 
        calendarId,
        lastSyncTime: new Date() 
      },
      { new: true }
    );
    return syncData;
  } catch (error) {
    console.error('Failed to update sync calendar:', error);
    throw error;
  }
}

async getTimeSlots(startDate, endDate) {
  try {
    console.log('=== Debug getTimeSlots ===');
    console.log('Request period:', {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString()
    });

    const businessHours = await BusinessHours.findOne({ clientId: 'default' });
    if (!businessHours) throw new Error('Business hours settings not found');

    console.log('Business Hours Settings:', businessHours.businessHours);

    const timeSlots = [];
    const currentDate = new Date(startDate);

    while (currentDate <= new Date(endDate)) {
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const dayConfig = businessHours.businessHours[dayOfWeek];

      console.log('Processing day:', {
        date: currentDate.toISOString(),
        dayOfWeek,
        isOpen: dayConfig?.isOpen
      });

      if (dayConfig && dayConfig.isOpen) {
        const [startHour] = dayConfig.start.split(':').map(Number);
        const [endHour] = dayConfig.end.split(':').map(Number);

        // その日のブロックを取得（日付の完全一致で検索）
        const dayBlocks = businessHours.exceptionalDays.filter(block => {
          const blockDate = new Date(block.date);
          const targetDate = new Date(currentDate);
          return blockDate.toDateString() === targetDate.toDateString();
        });

        console.log(`Found ${dayBlocks.length} blocks for ${currentDate.toDateString()}`);

        for (let hour = startHour; hour < endHour; hour++) {
          const slotDateTime = new Date(currentDate);
          slotDateTime.setHours(hour, 0, 0, 0);

          // この時間枠がブロックされているか単純に確認
          const isBlocked = dayBlocks.some(block => {
            const blockStart = new Date(block.date);
            const blockEnd = new Date(block.endTime);
            return slotDateTime >= blockStart && slotDateTime < blockEnd;
          });

          timeSlots.push({
            date: slotDateTime.toISOString().split('T')[0],
            startTime: `${hour.toString().padStart(2, '0')}:00`,
            endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
            capacity: dayConfig.slots,
            available: !isBlocked,
            blocked: isBlocked
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log('=== End Debug getTimeSlots ===');
    console.log('Total slots created:', timeSlots.length);

    return timeSlots;

  } catch (error) {
    console.error('Error in getTimeSlots service:', error);
    throw new Error(`Failed to get time slots: ${error.message}`);
  }
}









  

  async getReservationsByDate(date) {
    try {
      const targetDate = new Date(date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(targetDate.getDate() + 1);
  
      return await Reservation.find({
        datetime: {
          $gte: targetDate,
          $lt: nextDate
        }
      }).sort({ datetime: 1 });
    } catch (error) {
      console.error('Error in getReservationsByDate service:', error);
      throw error;
    }
  }
  
  
  
  async initializeBusinessHours() {
    try {
      // デフォルトの営業時間が存在するか確認
      const exists = await BusinessHours.findOne({ clientId: 'default' });
      
      if (!exists) {
        // デフォルトの営業時間を作成
        const defaultBusinessHours = new BusinessHours({
          clientId: 'default',
          businessHours: {
            monday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            tuesday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            wednesday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            thursday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            friday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            saturday: { isOpen: false, start: '12:00', end: '18:00', slots: 1 },
            sunday: { isOpen: false, start: '12:00', end: '18:00', slots: 1 }
          },
          timeSlotDuration: 60,
          reservationPeriod: {
            start: 1,
            end: 30
          }
        });
  
        await defaultBusinessHours.save();
        console.log('Default business hours initialized');
      }
    } catch (error) {
      console.error('Failed to initialize business hours:', error);
      throw error;
    }
  }
  
  
  async getBusinessHours(clientId = 'default') {
    try {
      let businessHours = await BusinessHours.findOne({ clientId });
      
      if (!businessHours) {
        // デフォルトの営業時間設定を作成
        businessHours = new BusinessHours({
          clientId,
          businessHours: {
            monday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            tuesday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            wednesday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            thursday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            friday: { isOpen: true, start: '12:00', end: '18:00', slots: 1 },
            saturday: { isOpen: false, start: '12:00', end: '18:00', slots: 1 },
            sunday: { isOpen: false, start: '12:00', end: '18:00', slots: 1 }
          },
          timeSlotDuration: 60,
          reservationPeriod: {
            start: 1,
            end: 30
          }
        });
  
        await businessHours.save();
      }
  
      return businessHours;
    } catch (error) {
      console.error('Error in getBusinessHours service:', error);
      throw new Error('Failed to get business hours');
    }
  }

  // 営業時間設定の更新
  async updateBusinessHours(clientId, settings) {
    try {
      const businessHours = await BusinessHours.findOneAndUpdate(
        { clientId },
        { $set: settings },
        { new: true, upsert: true }
      );

      // 関連する予約スケジュールのキャッシュをクリア
      // 必要に応じて実装

      return businessHours;
    } catch (error) {
      console.error('Error in updateBusinessHours service:', error);
      throw new Error('Failed to update business hours');
    }
  }
  async updateReservation(reservationId, updateData) {
    try {
      // 予約の更新
      const reservation = await Reservation.findByIdAndUpdate(
        reservationId,
        updateData,
        { new: true }
      );
  
      if (!reservation) {
        throw new Error('Reservation not found');
      }
  
      console.log('Reservation updated:', {
        id: reservation._id,
        datetime: reservation.datetime,
        status: reservation.status
      });
  
      // メールテンプレートの再スケジュール（必要な場合）
      if (updateData.datetime) {
        try {
          const templates = await EmailTemplate.find({
            $or: [
              { clientId: reservation.clientId },
              { clientId: 'default' }
            ],
            isActive: true
          });
  
          console.log('Rescheduling emails for updated reservation:', templates.length);
  
          for (const template of templates) {
            try {
              // 既存のスケジュールをキャンセル
              await emailSchedulerService.cancelScheduledEmails(reservation._id, template._id);
              
              // 新しいスケジュールを作成
              const schedule = await emailSchedulerService.scheduleEmail(
                template._id,
                reservation._id,
                reservation.datetime
              );
              
              console.log('Email rescheduled:', {
                template: template.name,
                type: template.type,
                scheduledTime: schedule.scheduledTime || 'immediate',
                status: schedule.status
              });
            } catch (scheduleError) {
              console.error('Failed to reschedule email:', {
                template: template.name,
                error: scheduleError.message
              });
            }
          }
        } catch (emailError) {
          console.error('Email template processing error:', emailError);
        }
      }
  
      // Google Calendarのイベント更新
      if (reservation.googleCalendarEventId) {
        try {
          const syncData = await CalendarSync.findOne({ 
            clientId: reservation.clientId,
            syncEnabled: true,
            syncStatus: 'active'
          });
  
          if (syncData) {
            // トークンの有効性を確認・更新
            const validatedSync = await this.ensureValidToken(syncData);
            console.log('Calendar sync token validated for update:', {
              clientId: validatedSync.clientId,
              status: validatedSync.syncStatus
            });
  
            const calendar = googleCalendarConfig.getCalendarInstance(
              validatedSync.auth.accessToken
            );
  
            const event = {
              summary: `予約: ${reservation.customerInfo.name}様`,
              description: `
                会社名: ${reservation.customerInfo.company || '未設定'}
                電話番号: ${reservation.customerInfo.phone || '未設定'}
                メール: ${reservation.customerInfo.email}
                備考: ${reservation.customerInfo.message || 'なし'}
              `.trim(),
              start: {
                dateTime: reservation.datetime,
                timeZone: 'Asia/Tokyo',
              },
              end: {
                dateTime: new Date(new Date(reservation.datetime).getTime() + 60*60*1000),
                timeZone: 'Asia/Tokyo',
              },
            };
  
            // 予約がキャンセルされた場合
            if (updateData.status === 'cancelled') {
              event.status = 'cancelled';
              console.log('Cancelling Google Calendar event:', reservation.googleCalendarEventId);
            }
  
            await calendar.events.update({
              calendarId: syncData.calendarId,
              eventId: reservation.googleCalendarEventId,
              resource: event,
            });
  
            console.log('Google Calendar event updated:', {
              eventId: reservation.googleCalendarEventId,
              status: event.status || 'updated'
            });
          }
        } catch (calendarError) {
          console.error('Google Calendar sync error:', calendarError);
          // カレンダー同期エラーを記録
          await CalendarSync.findOneAndUpdate(
            { clientId: reservation.clientId },
            {
              $set: {
                syncStatus: 'error',
                error: {
                  message: calendarError.message,
                  timestamp: new Date()
                }
              }
            }
          );
        }
      }
  
      return reservation;
    } catch (error) {
      console.error('Error in updateReservation:', error);
      throw error;
    }
  } 
 }

export default new CalendarService();