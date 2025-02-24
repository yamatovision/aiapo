// src/tests/email/reminderTest.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { EmailTemplate, EmailSchedule, EmailLog } from '../../modules/email/email.model.js';
import { Reservation } from '../../modules/calendar/calendar.model.js';
import emailSchedulerService from '../../modules/email/email-scheduler.service.js';

// 環境変数の設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');
dotenv.config({ path: resolve(rootDir, '.env') });

class ReminderTester {
  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI; // MONGODB_URI に変更
      if (!mongoUri) {
        throw new Error('MongoDB URI is not set in environment variables');
      }

      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('MongoDB connected for testing');
      // セキュリティのため、完全なURIは表示しない
      console.log('Using database:', mongoUri.split('@')[1]?.split('/')[1] || 'connected');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }
  async createTestReservation() {
    const reservation = new Reservation({
      clientId: 'test-client',
      datetime: new Date(Date.now() + 5 * 60000), // 5分後
      status: 'confirmed',
      customerInfo: {
        name: 'テストユーザー',
        email: 'inno.sub.zumi+1@gmail.com', // 実際のテストメールアドレス
        phone: '090-1234-5678',
        message: 'テスト予約'
      }
    });
    await reservation.save();
    console.log('Test reservation created:', reservation._id);
    return reservation;
  }

  async createTestTemplates() {
    const timestamp = Date.now();
    const templates = [
      {
        name: `予約確認メール_TEST_${timestamp}`,
        type: 'confirmation',
        subject: '【テスト】予約確認のお知らせ',
        body: '{{name}}様\n\nご予約ありがとうございます。\n予約日時：{{date}} {{time}}\n\nこれはテストメールです。',
        isActive: true
      },
      {
        name: `直前リマインド_TEST_${timestamp}`,
        type: 'reminder',
        subject: '【テスト】もうすぐご予約のお時間です',
        body: '{{name}}様\n\nまもなくご予約のお時間です。\n予約日時：{{date}} {{time}}\n\nこれはテストメールです。',
        timing: { value: 1, unit: 'minutes' }, // テスト用に1分後に設定
        isActive: true
      }
    ];
  
    const savedTemplates = [];
    for (const template of templates) {
      try {
        const savedTemplate = await EmailTemplate.create(template);
        console.log('Test template created:', savedTemplate.name);
        savedTemplates.push(savedTemplate);
      } catch (error) {
        console.error('Failed to create template:', template.name, error);
        throw error;
      }
    }
    return savedTemplates;
  }
  
  // クリーンアップ処理も修正
  async cleanup() {
    try {
      console.log('Starting cleanup...');
      // テストデータのクリーンアップ
      const reservationResult = await Reservation.deleteMany({ clientId: 'test-client' });
      console.log('Reservations cleaned:', reservationResult.deletedCount);
  
      // _TEST_ を含むテンプレートのみを削除
      const templateResult = await EmailTemplate.deleteMany({ name: { $regex: '_TEST_' } });
      console.log('Templates cleaned:', templateResult.deletedCount);
  
      const scheduleResult = await EmailSchedule.deleteMany({ 
        reservationId: { $regex: /^test-/ } 
      });
      console.log('Schedules cleaned:', scheduleResult.deletedCount);
  
      const logResult = await EmailLog.deleteMany({ 
        reservationId: { $regex: /^test-/ } 
      });
      console.log('Logs cleaned:', logResult.deletedCount);
  
      await mongoose.connection.close();
      console.log('Cleanup completed');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async runCronTest() {
    try {
      console.log('Starting cron test...', new Date().toISOString());

      // テストデータ作成
      const reservation = await this.createTestReservation();
      const templates = await this.createTestTemplates();
      
      console.log('Test data created:', {
        reservationId: reservation._id,
        templates: templates.map(t => t.name)
      });

      // メールスケジュール作成
      for (const template of templates) {
        const schedule = await emailSchedulerService.scheduleEmail(
          template._id,
          reservation._id,
          reservation.datetime
        );
        console.log('Email scheduled:', {
          template: template.name,
          scheduledTime: schedule.scheduledTime
        });
      }

      // スケジュール状態確認
      const schedules = await EmailSchedule.find({
        reservationId: reservation._id
      }).populate('templateId');
      
      console.log('Created schedules:', schedules.map(s => ({
        template: s.templateId.name,
        status: s.status,
        scheduledTime: s.scheduledTime
      })));

      // cronジョブ実行
      console.log('Running scheduler check...', new Date().toISOString());
      const results = await emailSchedulerService.checkAndSendScheduledEmails();
      console.log('Scheduler check results:', results);

      // 送信ログ確認
      const logs = await EmailLog.find({
        reservationId: reservation._id
      }).populate('templateId');
      
      console.log('Email logs:', logs.map(log => ({
        template: log.templateId.name,
        status: log.status,
        sentAt: log.sentAt,
        error: log.error
      })));

      return {
        reservation,
        schedules,
        logs,
        results
      };

    } catch (error) {
      console.error('Cron test error:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      // テストデータのクリーンアップ
      await EmailSchedule.deleteMany({ reservationId: { $regex: /^test-/ } });
      await EmailLog.deleteMany({ reservationId: { $regex: /^test-/ } });
      await Reservation.deleteMany({ clientId: 'test-client' });
      await EmailTemplate.deleteMany({ name: { $regex: /テスト/ } });
      await mongoose.connection.close();
      console.log('Cleanup completed');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

// テスト実行関数
async function runTest() {
  const tester = new ReminderTester();
  try {
    await tester.connect();
    const results = await tester.runCronTest();
    console.log('Test completed successfully');
    return results;
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    // await tester.cleanup(); // クリーンアップはコメントアウト（結果確認用）
  }
}


console.log('\n=== Email Test Environment ===');
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'configured' : 'not set');
console.log('AWS Region:', process.env.AWS_REGION || 'not set');
console.log('SES From Email:', process.env.SES_FROM_EMAIL || 'not set');
console.log('==========================\n');

// ファイル直接実行時の処理
console.log('Starting test execution...');

runTest()
  .then((results) => {
    console.log('\n=== Test Results ===');
    console.log('Reservation created:', results?.reservation?._id);
    console.log('Schedules created:', results?.schedules?.length);
    console.log('Emails sent:', results?.logs?.length);
    console.log('===================\n');
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });



export default runTest;