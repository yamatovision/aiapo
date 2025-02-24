// src/modules/line/line.scheduler.js
import cron from 'node-cron';
import { Reservation } from '../calendar/calendar.model.js';
import { LineUser, LineTemplate, ReminderHistory } from './line.model.js';
import lineQueueService from './line-queue.service.js';
import lineRetryService from './line-retry.service.js';
import { checkConnection } from '../../config/database.js';

class LineScheduler {
  constructor() {
    this.reminderJob = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        console.error('Reminder job error:', error);
      }
    });
  
    this.retryJob = cron.schedule('0 * * * *', async () => {
      try {
        await this.retryFailedMessages();
      } catch (error) {
        console.error('Retry job error:', error);
      }
    });
  }
  async checkAndSendReminders() {
    let results = {
      sent: 0,
      failed: 0,
      skipped: 0
    };
  
    try {
      console.log('Checking reminders...', new Date());
      const now = new Date();
  
      // アクティブなテンプレートを全て取得
      const templates = await LineTemplate.find({
        isActive: true,
        type: { $ne: 'confirmation' }
      });
  
      // 各テンプレートを並行処理
      const templateResults = await Promise.all(
        templates.map(template => 
          this.processTemplateReminders(template, now, results)
        )
      );
  
      // 結果を集計
      templateResults.forEach(result => {
        if (result) {
          results.sent += result.sent;
          results.failed += result.failed;
          results.skipped += result.skipped;
        }
      });
  
      return results;  // 結果を返す
  
    } catch (error) {
      console.error(`Reminder check error:`, error);
      return results;  // エラー時も結果を返す
    }
  }

  async processTemplateReminders(template, now) {
    let templateResults = {
      sent: 0,
      failed: 0,
      skipped: 0
    };
  
    try {
      const minutes = template.reminderMinutes;
      const isBeforeReminder = minutes >= 0;
  
      // 予約を取得
      const reservations = await this.getEligibleReminders(
        template,
        now
      );
  
      if (reservations.length === 0) {
        templateResults.skipped++;
        return templateResults;
      }
  
      // 各予約に対してリマインダーを処理
      for (const reservation of reservations) {
        try {
          await this.processReminder(reservation, template);
          templateResults.sent++;
        } catch (error) {
          console.error(`Error processing reminder for reservation ${reservation._id}:`, error);
          templateResults.failed++;
        }
      }
  
      return templateResults;
  
    } catch (error) {
      console.error(`Error processing template ${template._id}:`, error);
      return templateResults;
    }
  }


  async getEligibleReminders(template, now, limit = 10, skip = 0) {
    const minutes = template.reminderMinutes;
    const isBeforeReminder = minutes < 0;
    
    console.log('Checking reminders with:', {
      minutes,
      isBeforeReminder,
      currentTime: now,
      template: template.name
    });
  
    let timeQuery;
    if (isBeforeReminder) {
      // 「前」の場合は予約時刻基準（変更なし）
      const targetTime = new Date(now.getTime() + minutes * 60000);
      timeQuery = {
        datetime: {
          $gte: new Date(targetTime.getTime() - 5 * 60000),
          $lte: targetTime
        }
      };
    } else {
      // 「後」の場合は登録時刻基準
      // 現在時刻からX分前の期間に作成された予約を取得
      const timeWindow = {
        start: new Date(now.getTime() - (minutes + 5) * 60000),
        end: new Date(now.getTime() - minutes * 60000)
      };
      
      console.log('Time window for checking:', {
        start: timeWindow.start,
        end: timeWindow.end
      });
  
      timeQuery = {
        createdAt: {
          $gte: timeWindow.start,
          $lte: timeWindow.end
        }
      };
    }
  
    // 既に送信済みのリマインダーを取得
    const sentReminders = await ReminderHistory.find({
      reminderType: template.type,
      reminderMinutes: minutes,
      status: 'sent',
      createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) }
    }).distinct('reservationId');
  
    // デバッグログを追加
    console.log('Finding eligible reservations with query:', {
      timeQuery,
      status: 'confirmed',
      lineConnectionStatus: 'connected',
      excludedIds: sentReminders.length
    });
  
    // 対象予約を取得
    const eligibleReservations = await Reservation.find({
      ...timeQuery,
      status: 'confirmed',
      'lineConnection.status': 'connected',
      _id: { $nin: sentReminders }
    })
    .populate('customerInfo')
    .skip(skip)
    .limit(limit)
    .lean();
  
    console.log(`Found ${eligibleReservations.length} eligible reservations for template type: ${template.type}`, {
      reservations: eligibleReservations.map(r => ({
        id: r._id,
        createdAt: r.createdAt,
        lineUserId: r.lineConnection?.lineUserId
      }))
    });
  
    return eligibleReservations;
  }


async processReminder(reservation, template) {
  const reminderHistory = await ReminderHistory.create({
    reservationId: reservation._id,
    reminderType: template.type,
    reminderMinutes: template.reminderMinutes,
    status: 'pending'
  });

  try {
    // lineUserIdを予約情報から取得するように変更
    const lineUserId = reservation.lineConnection?.lineUserId;
    if (!lineUserId) {
      throw new Error('No LINE userId found in reservation');
    }

    const lineUser = await LineUser.findOne({
      lineUserId: lineUserId,  // lineUserIdで検索するように変更
      status: 'active'
    });

    if (!lineUser) {
      throw new Error('No active LINE user found');
    }

    const message = this.replaceTemplateVariables(template.content, reservation);
    const queueResult = await lineQueueService.addToQueue({
      tenantId: lineUser.tenantId || 'default',
      lineUserId: lineUser.lineUserId,
      message,
      reminderType: template.type,
      reminderHistoryId: reminderHistory._id
    });

    if (queueResult && queueResult.success) {
      await this.updateReminderHistory(
        reminderHistory._id, 
        'sent', 
        null, 
        queueResult.messageId
      );

      await Reservation.findByIdAndUpdate(
        reservation._id,
        { 
          $set: { 
            [`lineNotification.${template.type}`]: true 
          } 
        }
      );

      console.log(`Reminder sent successfully: ${template.type}`, {
        reservationId: reservation._id,
        messageId: queueResult.messageId,
        requestId: queueResult.requestId,
        reminderMinutes: template.reminderMinutes
      });
    }

  } catch (error) {
    console.error(`Error processing ${template.type} reminder:`, error);
    await this.updateReminderHistory(
      reminderHistory._id, 
      'failed', 
      error.message
    );
  }
}

  async updateReminderHistory(historyId, status, error = null, messageId = null) {
    const update = {
      status,
      ...(status === 'sent' ? { 
        sentAt: new Date(),
        messageId 
      } : {}),
      ...(error ? { error } : {})
    };

    await ReminderHistory.findByIdAndUpdate(historyId, update);
  }

  async retryFailedMessages() {
    try {
      if (!checkConnection()) {
        throw new Error('Database connection is not available');
      }
      await lineRetryService.retryFailedMessages();
    } catch (error) {
      console.error('Retry process error:', error);
    }
  }

  replaceTemplateVariables(content, reservation) {
    return content.replace(/{{(\w+)}}/g, (match, variable) => {
      switch (variable) {
        case 'name':
          return reservation.customerInfo?.name || '';
        case 'date':
          return new Date(reservation.datetime).toLocaleDateString('ja-JP');
        case 'time':
          return new Date(reservation.datetime).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
          });
        default:
          return match;
      }
    });
  }

  start() {
    this.reminderJob.start();
    this.retryJob.start();
    console.log('LINE reminder scheduler started');
  }

  stop() {
    this.reminderJob.stop();
    this.retryJob.stop();
    console.log('LINE reminder scheduler stopped');
  }
}

export default new LineScheduler();