import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailTemplate, EmailLog } from './email.model.js';
import { Reservation } from '../calendar/calendar.model.js';

class EmailService {
  constructor() {
    this.sesClient = null;
    this.debugMode = process.env.EMAIL_DEBUG === 'true';
  }

  initializeSESClient() {
    if (!this.sesClient) {
      this.sesClient = new SESClient({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
    }
  }

  async validateEmailConfig() {
    const requiredEnvVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'SES_FROM_EMAIL'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  replaceTemplateVariables(content, reservation, clientSettings = {}) {
    if (!content) return '';
    
    let processedContent = content;
    
    // HTML形式の改行処理
    processedContent = processedContent.replace(/\n/g, '<br>');

    // 基本変数の置換
    const baseVariables = {
      '{{name}}': reservation.customerInfo.name,
      '{{email}}': reservation.customerInfo.email,
      '{{company}}': reservation.customerInfo.company || '',
      '{{date}}': new Date(reservation.datetime).toLocaleDateString('ja-JP'),
      '{{time}}': new Date(reservation.datetime).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      '{{phone}}': reservation.customerInfo.phone || '',
      '{{message}}': reservation.customerInfo.message || ''
    };

    // 変数置換処理
    Object.entries(baseVariables).forEach(([key, value]) => {
      processedContent = processedContent.replace(new RegExp(key, 'g'), value || '');
    });

    return processedContent;
  }

  async logEmailAttempt(params, type = 'scheduled') {
    if (this.debugMode) {
      console.log(`Email attempt (${type}):`, {
        to: params.Destination.ToAddresses,
        subject: params.Message.Subject.Data,
        timestamp: new Date().toISOString()
      });
    }
  }

  async createEmailLog(templateId, reservationId, status, error = null, messageId = null) {
    try {
      const log = await EmailLog.create({
        templateId,
        reservationId,
        status,
        error: error?.message || error,
        messageId,
        sentAt: new Date()
      });

      if (this.debugMode) {
        console.log('Email log created:', {
          status,
          templateId,
          reservationId,
          timestamp: log.sentAt
        });
      }

      return log;
    } catch (logError) {
      console.error('Error creating email log:', logError);
    }
  }

  async sendEmail(templateId, reservationId) {
    try {
      await this.validateEmailConfig();
      this.initializeSESClient();

      const template = await EmailTemplate.findById(templateId);
      const reservation = await Reservation.findById(reservationId);

      if (!template || !reservation) {
        throw new Error('Template or Reservation not found');
      }

      // メール本文の生成
      const subject = this.replaceTemplateVariables(template.subject, reservation);
      const body = this.replaceTemplateVariables(template.body, reservation);

      const params = {
        Source: `株式会社命 <${process.env.SES_FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [reservation.customerInfo.email]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Text: {
              Data: body.replace(/<br>/g, '\n'),
              Charset: 'UTF-8'
            },
            Html: {
              Data: `<div style="font-family: sans-serif;">${body}</div>`,
              Charset: 'UTF-8'
            }
          }
        }
      };

      await this.logEmailAttempt(params);

      const command = new SendEmailCommand(params);
      const result = await this.sesClient.send(command);

      // 成功ログの作成
      await this.createEmailLog(
        templateId,
        reservationId,
        'success',
        null,
        result.MessageId
      );

      return {
        success: true,
        messageId: result.MessageId,
        template: template.name,
        sentTo: reservation.customerInfo.email
      };

    } catch (error) {
      console.error('Email sending error:', {
        templateId,
        reservationId,
        error: error.message,
        stack: error.stack
      });

      // エラーログの作成
      await this.createEmailLog(
        templateId,
        reservationId,
        'failed',
        error
      );

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  // テスト用メソッド
  async verifyEmailDelivery(reservationId) {
    try {
      const logs = await EmailLog.find({ reservationId })
        .populate('templateId')
        .sort({ sentAt: -1 });

      const summary = {
        totalAttempts: logs.length,
        successful: logs.filter(log => log.status === 'success').length,
        failed: logs.filter(log => log.status === 'failed').length,
        lastAttempt: logs[0]?.sentAt,
        details: logs.map(log => ({
          template: log.templateId.name,
          status: log.status,
          sentAt: log.sentAt,
          error: log.error
        }))
      };

      return summary;
    } catch (error) {
      console.error('Error verifying email delivery:', error);
      throw error;
    }
  }



  async sendTestEmail(templateId, testEmail) {
    try {
      // SESClientの初期化を実行時に行う
      this.initializeSESClient();

      const template = await EmailTemplate.findById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const dummyReservation = {
        customerInfo: {
          name: 'テストユーザー',
          email: testEmail,
          company: 'テスト株式会社',
          phone: '03-1234-5678',
          message: 'これはテストメールです。'
        },
        datetime: new Date()
      };

      const subject = this.replaceTemplateVariables(template.subject, dummyReservation);
      const body = this.replaceTemplateVariables(template.body, dummyReservation);

      // AWS SES パラメータ
      const params = {
        Source: `株式会社命 <${process.env.SES_FROM_EMAIL}>`,
        Destination: {
          ToAddresses: [testEmail]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Text: {
              Data: body.replace(/<br>/g, '\n'),
              Charset: 'UTF-8'
            },
            Html: {
              Data: `<pre style="font-family: sans-serif;">${body}</pre>`,
              Charset: 'UTF-8'
            }
          }
        }
      };

      // 送信パラメータのログ出力
      console.log('Sending email with params:', {
        to: testEmail,
        from: process.env.SES_FROM_EMAIL,
        subject: subject,
        credentials: {
          region: process.env.AWS_REGION,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ? '設定済み' : '未設定',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? '設定済み' : '未設定'
        }
      });

      const command = new SendEmailCommand(params);
      const result = await this.sesClient.send(command);

      // 送信成功のログを記録
      await EmailLog.create({
        templateId: template._id,
        status: 'success',
        messageId: result.MessageId,
        sentAt: new Date()
      });

      console.log('Email sent successfully:', result);
      return result;

    } catch (error) {
      console.error('Email sending error:', {
        message: error.message,
        stack: error.stack,
        metadata: error.$metadata
      });

      // エラーログを記録
      await EmailLog.create({
        templateId,
        status: 'failed',
        error: error.message,
        sentAt: new Date()
      });

      throw error;
    }
  }

  // テンプレート管理メソッド
  async getTemplates() {
    return await EmailTemplate.find().sort({ type: 1, name: 1 });
  }

  async saveTemplate(templateData) {
    const cleanedData = {
      ...templateData,
      timing: {
        value: templateData.timing.value,
        unit: templateData.timing.unit,
        scheduledTime: null
      }
    };

    if (templateData._id) {
      return await EmailTemplate.findByIdAndUpdate(
        templateData._id,
        { ...cleanedData, updatedAt: new Date() },
        { new: true }
      );
    }
    return await EmailTemplate.create(cleanedData);
  }

  async deleteTemplate(id) {
    return await EmailTemplate.findByIdAndDelete(id);
  }

  async getLogs(filters = {}) {
    return await EmailLog.find(filters)
      .populate('templateId', 'name type')
      .populate('reservationId', 'datetime customerInfo')
      .sort({ sentAt: -1 });
  }
}

export default new EmailService();