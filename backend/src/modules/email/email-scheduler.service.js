// email-scheduler.service.js

import { EmailTemplate, EmailSchedule } from './email.model.js';
import emailService from './email.service.js';
import { Reservation } from '../calendar/calendar.model.js';  // この行を追加



class EmailSchedulerService {
  constructor() {
    this.debugMode = process.env.EMAIL_DEBUG === 'true';
  }

  // 送信時刻の計算を改善
  // email-scheduler.service.js
  calculateScheduledTime(reservationTime, timing, type) {
    try {
      const { value, unit } = timing;
      const reservationDate = new Date(reservationTime);
      
      console.log('Calculating schedule time:', {
        type,
        timing,
        reservationTime: reservationDate.toISOString()
      });
  
      const timeOffsets = {
        minutes: value * 60000,
        hours: value * 3600000,
        days: value * 86400000
      };
  
      if (!timeOffsets[unit]) {
        throw new Error(`Invalid timing unit: ${unit}`);
      }
  
      // タイプに応じて計算方法を変える
      const scheduledTime = new Date(
        type === 'reminder' 
          ? reservationDate.getTime() - timeOffsets[unit]  // リマインダーは予約時間前
          : reservationDate.getTime() + timeOffsets[unit]  // フォローアップは予約時間後
      );
  
      return scheduledTime;
    } catch (error) {
      console.error('Error calculating schedule time:', error);
      throw error;
    }
  }

  // メールのスケジュール登録を強化
 // email-scheduler.service.js

async scheduleEmail(templateId, reservationId, reservationTime) {
  try {
    console.log('\n=== Scheduling Email ===');
    console.log('Request params:', {
      templateId,
      reservationId,
      reservationTime: new Date(reservationTime).toISOString()
    });

    // 1. テンプレートとリザベーションの存在確認
    const template = await EmailTemplate.findById(templateId);
    const reservation = await Reservation.findById(reservationId);

    if (!template || !reservation) {
      throw new Error('Template or Reservation not found');
    }

    // 2. 既存のスケジュールチェック（重複防止）
    const existingSchedule = await EmailSchedule.findOne({
      templateId,
      reservationId,
      status: 'scheduled'
    }).populate('templateId', 'name type');

    if (existingSchedule) {
      console.log('Duplicate schedule prevented:', {
        templateName: template.name,
        scheduledTime: existingSchedule.scheduledTime,
        reservationDateTime: reservation.datetime,
        customerEmail: reservation.customerInfo.email
      });
      return {
        status: 'exists',
        schedule: existingSchedule,
        message: 'Schedule already exists for this template and reservation'
      };
    }

    // 3. 即時送信の確認（予約確認メールの場合）
    if (template.type === 'confirmation') {
      console.log('Processing immediate confirmation email');
      const result = await emailService.sendEmail(templateId, reservationId);
      return {
        status: 'sent',
        messageId: result.messageId,
        template: template.name
      };
    }

    // 4. スケジュール時間の計算
    const scheduledTime = this.calculateScheduledTime(
      reservationTime,
      template.timing,
      template.type
    );

    console.log('Calculated schedule time:', {
      templateName: template.name,
      type: template.type,
      timing: template.timing,
      scheduledTime: scheduledTime.toISOString()
    });

    // 5. 現在時刻との比較（過去の場合は即時送信）
    if (scheduledTime <= new Date()) {
      console.log('Schedule time is in the past, sending immediately');
      return await emailService.sendEmail(templateId, reservationId);
    }

    // 6. 新規スケジュールの作成
    const schedule = new EmailSchedule({
      templateId,
      reservationId,
      scheduledTime,
      status: 'scheduled'
    });

    await schedule.save();
    
    console.log('Email scheduled successfully:', {
      templateName: template.name,
      scheduledTime: schedule.scheduledTime,
      recipientEmail: reservation.customerInfo.email,
      status: schedule.status
    });

    return {
      status: 'scheduled',
      schedule,
      message: 'Email scheduled successfully'
    };

  } catch (error) {
    console.error('Error scheduling email:', error);
    throw error;
  }
}





  async checkAndSendScheduledEmails() {
    try {
      const now = new Date();
      console.log('\n=== Check And Send Scheduled Emails ===');
      console.log('Current time:', now.toISOString());
  
      // クエリ条件を明示的に表示
      const query = {
        scheduledTime: { $lte: now },
        status: 'scheduled'
      };
      console.log('Query conditions:', JSON.stringify(query));
  
      const schedulesToSend = await EmailSchedule
        .find(query)
        .populate('templateId')
        .populate('reservationId');
  
      console.log('Found schedules:', {
        count: schedulesToSend.length,
        details: schedulesToSend.map(s => ({
          id: s._id.toString(),
          templateName: s.templateId?.name,
          scheduledTime: s.scheduledTime,
          currentTime: now,
          timeDiffMinutes: Math.round((now - new Date(s.scheduledTime)) / 60000),
          reservationTime: s.reservationId?.datetime,
          status: s.status,
          recipientEmail: s.reservationId?.customerInfo?.email
        }))
      });
  
      // 処理結果の詳細なログ
      const results = {
        total: schedulesToSend.length,
        sent: 0,
        failed: 0,
        details: []
      };
  
      for (const schedule of schedulesToSend) {
        try {
          console.log(`Processing schedule: ${schedule._id}`, {
            template: schedule.templateId?.name,
            scheduledTime: schedule.scheduledTime,
            recipientEmail: schedule.reservationId?.customerInfo?.email
          });
  
          // 既存の送信処理
          const result = await emailService.sendEmail(
            schedule.templateId._id,
            schedule.reservationId._id
          );
  
          schedule.status = 'sent';
          await schedule.save();
  
          results.sent++;
          results.details.push({
            id: schedule._id,
            status: 'success',
            template: schedule.templateId?.name,
            sentAt: new Date()
          });
  
        } catch (error) {
          console.error('Failed to send email:', {
            scheduleId: schedule._id,
            error: error.message
          });
  
          results.failed++;
          results.details.push({
            id: schedule._id,
            status: 'failed',
            template: schedule.templateId?.name,
            error: error.message
          });
  
          schedule.status = 'failed';
          schedule.error = error.message;
          await schedule.save();
        }
      }
  
      console.log('Processing results:', results);
      console.log('=== Check And Send Completed ===\n');
  
      return results;
  
    } catch (error) {
      console.error('Fatal error in checkAndSendScheduledEmails:', error);
      throw error;
    }
  }

  // 失敗したメールの再試行機能を改善
  async retryFailedEmails() {
    try {
      const failedSchedules = await EmailSchedule
        .find({ status: 'failed' })
        .populate('templateId')
        .populate('reservationId');

      const results = {
        total: failedSchedules.length,
        success: 0,
        failed: 0,
        details: []
      };

      for (const schedule of failedSchedules) {
        try {
          const result = await emailService.sendEmail(
            schedule.templateId._id,
            schedule.reservationId._id
          );

          schedule.status = 'sent';
          schedule.error = null;
          schedule.updatedAt = new Date();
          await schedule.save();

          results.success++;
          results.details.push({
            template: schedule.templateId.name,
            status: 'success',
            messageId: result.messageId
          });

        } catch (error) {
          console.error(`Retry failed for email ${schedule._id}:`, error);
          
          schedule.error = error.message;
          schedule.updatedAt = new Date();
          await schedule.save();

          results.failed++;
          results.details.push({
            template: schedule.templateId.name,
            status: 'failed',
            error: error.message
          });
        }
      }

      console.log('Retry results:', results);
      return results;
    } catch (error) {
      console.error('Error retrying failed emails:', error);
      throw error;
    }
  }

  // スケジュール状態の取得を改善
  async getScheduleStatus(templateId, reservationId) {
    try {
      const schedule = await EmailSchedule.findOne({
        templateId,
        reservationId
      })
      .sort({ createdAt: -1 })
      .populate('templateId', 'name type')
      .populate('reservationId', 'datetime customerInfo');

      if (!schedule) {
        return {
          exists: false,
          message: 'No schedule found'
        };
      }

      return {
        exists: true,
        status: schedule.status,
        scheduledTime: schedule.scheduledTime,
        template: schedule.templateId.name,
        error: schedule.error
      };
    } catch (error) {
      console.error('Error getting schedule status:', error);
      throw error;
    }
  }
}

export default new EmailSchedulerService();