// line.service.js

import { Client } from '@line/bot-sdk';
import { LineUser, LineMessage, LineTemplate } from './line.model.js';
import { defaultTemplates } from './templates/default.js';
import { Reservation } from '../calendar/calendar.model.js';
import crypto from 'crypto';
import lineQueueService from './line-queue.service.js';  // 追加




class LineService {
  constructor() {
    this.clients = new Map();
    this.DEFAULT_TENANT_ID = 'default';
    // 設定の初期化を遅延させる
    this.defaultConfig = null;
  }



  getEffectiveTenantId(tenantId) {
    return tenantId || this.DEFAULT_TENANT_ID;
  }

  getConfig() {
    if (!this.defaultConfig) {
      this.defaultConfig = {
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
        channelSecret: process.env.LINE_CHANNEL_SECRET
      };
    }
    return this.defaultConfig;
  }

  getClient(tenantId) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    
    if (!this.clients.has(effectiveTenantId)) {
      const config = this.getConfig();
      console.log('Creating LINE client with config:', {
        hasAccessToken: !!config.channelAccessToken,
        hasSecret: !!config.channelSecret
      });
      
      if (!config.channelAccessToken || !config.channelSecret) {
        throw new Error('LINE configuration is missing');
      }
      
      this.clients.set(effectiveTenantId, new Client(config));
    }
    
    return this.clients.get(effectiveTenantId);
  }

  replaceTemplateVariables(content, reservation) {
    if (!content || !reservation?.customerInfo) return '';
    
    let processedContent = content;
    const baseVariables = {
      '{{name}}': reservation.customerInfo.name,
      '{{date}}': new Date(reservation.datetime).toLocaleDateString('ja-JP'),
      '{{time}}': new Date(reservation.datetime).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      '{{zoom_url}}': reservation.zoomUrl || ''
    };

    Object.entries(baseVariables).forEach(([key, value]) => {
      processedContent = processedContent.replace(new RegExp(key, 'g'), value || '');
    });

    return processedContent;
  }

  async initializeTemplates(tenantId) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    try {
      const existingTemplates = await LineTemplate.find({ tenantId: effectiveTenantId });
      if (existingTemplates.length === 0) {
        await LineTemplate.insertMany(
          defaultTemplates.map(template => ({
            ...template,
            tenantId: effectiveTenantId,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }))
        );
      }
      return true;
    } catch (error) {
      console.error('Template initialization error:', error);
      return false;
    }
  }



// line.service.js




async sendMessage(tenantId, lineUserId, message, reminderType = null) {
  const effectiveTenantId = this.getEffectiveTenantId(tenantId);
  const client = this.getClient(effectiveTenantId);

  try {
    console.log('\n=== Send Message Debug ===');
    console.log('1. Sending message with:', {
      tenantId: effectiveTenantId,
      lineUserId,
      messageLength: message.length,
      reminderType
    });

    // LINE APIのチャネルアクセストークンを確認
    console.log('2. LINE Channel Token Check:', {
      exists: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      length: process.env.LINE_CHANNEL_ACCESS_TOKEN?.length
    });

    // メッセージ送信前のペイロードを確認
    const messagePayload = {
      type: 'text',
      text: message
    };
    console.log('3. Message Payload:', messagePayload);

    const result = await client.pushMessage(lineUserId, messagePayload);
    console.log('4. Message sent successfully:', result);

    // メッセージ履歴の作成
    await LineMessage.create({
      tenantId: effectiveTenantId,
      lineUserId,
      messageType: 'text',
      reminderType,
      content: message,
      status: 'sent',
      sentAt: new Date()
    });

    return {
      success: true,
      messageId: result.sentMessages?.[0]?.id || null,
      requestId: result['x-line-request-id'] || null,
      sentMessages: result.sentMessages || [],
      timestamp: new Date()
    };

  } catch (error) {
    console.error('LINE message sending error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      details: error.response?.data?.details || error.response?.data?.message
    });

    // エラー時のメッセージ履歴を作成
    await LineMessage.create({
      tenantId: effectiveTenantId,
      lineUserId,
      messageType: 'text',
      reminderType,
      content: message,
      status: 'failed',
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data
      },
      sentAt: new Date()
    }).catch(err => {
      console.error('Failed to create error message history:', err);
    });

    throw new Error(`Failed to send LINE message: ${error.message}`);
  }
}
  
  





  async enableNotification(tenantId, reservationId, lineUserId) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    try {
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        throw new Error('Reservation not found');
      }

      await LineUser.findOneAndUpdate(
        { lineUserId },
        {
          tenantId: effectiveTenantId,
          reservationId,
          status: 'active',
          lastInteraction: new Date()
        },
        { upsert: true }
      );

      await this.initializeTemplates(effectiveTenantId);

      const template = await LineTemplate.findOne({
        tenantId: effectiveTenantId,
        type: 'confirmation',
        isActive: true
      });

      if (template) {
        const message = this.replaceTemplateVariables(template.content, reservation);
        await this.sendMessage(effectiveTenantId, lineUserId, message);
      }

      return true;
    } catch (error) {
      console.error('Enable notification error:', error);
      throw error;
    }
  }
// line.service.js の sendReminder メソッドを修正






// line.service.js の sendReminder メソッド

async sendReminder(reservationId, reminderType) {
  let lineUser = null;
  try {
    console.log('\n=== Send Reminder Debug ===');
    console.log('1. Input:', { reservationId, reminderType });

    // 予約情報の取得
    const reservation = await Reservation.findById(reservationId);
    console.log('2. Reservation found:', !!reservation, {
      id: reservation?._id,
      datetime: reservation?.datetime
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    // LINEユーザー情報の取得
    lineUser = await LineUser.findOne({ 
      lineUserId: reservation.lineConnection.lineUserId,  // lineUserIdで検索
      status: 'active'
    });
    console.log('3. LINE User found:', !!lineUser, {
      id: lineUser?._id,
      lineUserId: lineUser?.lineUserId,
      status: lineUser?.status
    });

    if (!lineUser) {
      throw new Error('No active LINE user found');
    }

    // テンプレートの取得
    const template = await LineTemplate.findOne({
      tenantId: lineUser.tenantId || 'default',
      type: reminderType,
      isActive: true
    });
    console.log('4. Template found:', !!template, {
      id: template?._id,
      type: template?.type
    });

    if (!template) {
      throw new Error('No active template found');
    }

    // メッセージの作成
    const message = this.replaceTemplateVariables(template.content, reservation);
    console.log('5. Message prepared:', {
      length: message?.length,
      preview: message?.substring(0, 50)
    });

    // メッセージ送信
    const result = await this.sendMessage(
      lineUser.tenantId || 'default',
      lineUser.lineUserId,
      message,
      reminderType
    );

    console.log('6. Send result:', result);

    return {
      success: true,
      message: 'Reminder sent successfully',
      details: {
        reservationId,
        type: reminderType,
        lineUserId: lineUser.lineUserId,
        sentAt: new Date()
      }
    };

  } catch (error) {
    console.error('Reminder sending error:', error);
    if (error.response) {
      console.error('LINE API Error Details:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    throw error;
  }
}



async handleFollow(tenantId, lineUserId, token) {
  try {
    console.log('Starting handleFollow:', { tenantId, lineUserId, token });

    const existingReservation = await Reservation.findOne({
      'lineConnection.token': token
    });

    console.log('Found reservation:', {
      exists: !!existingReservation,
      id: existingReservation?._id,
      email: existingReservation?.customerInfo?.email
    });

    if (existingReservation) {
      if (existingReservation.lineConnection.status === 'connected') {
        console.log('Reservation already connected');
        return {
          success: true,
          status: 'already_connected',
          reservationId: existingReservation._id
        };
      }

      // 予約情報の更新
      const updated = await Reservation.findByIdAndUpdate(
        existingReservation._id,
        {
          $set: {
            'lineConnection.status': 'connected',
            'lineConnection.lineUserId': lineUserId,
            'lineConnection.connectedAt': new Date()
          }
        },
        { new: true }
      );

      // LineUserの更新（メールアドレスと予約ID含む）
      const lineUser = await LineUser.findOneAndUpdate(
        { lineUserId },
        { 
          tenantId,
          status: 'active',
          email: existingReservation.customerInfo.email,  // メールアドレスを追加
          reservationId: existingReservation._id,         // 予約IDを追加
          lastInteraction: new Date()
        },
        { upsert: true, new: true }
      );

      console.log('Updated LINE user:', {
        lineUserId: lineUser.lineUserId,
        email: lineUser.email,
        reservationId: lineUser.reservationId
      });

      return {
        success: true,
        status: 'connected',
        reservationId: updated._id,
        lineUserId: lineUser.lineUserId
      };
    }

    // トークンに紐づく予約が見つからない場合
    const lineUser = await LineUser.findOneAndUpdate(
      { lineUserId },
      { 
        tenantId,
        status: 'active',
        lastInteraction: new Date()
      },
      { upsert: true, new: true }
    );

    return {
      success: true,
      status: 'registered_without_reservation',
      lineUserId: lineUser.lineUserId
    };

  } catch (error) {
    console.error('Follow handling error:', error);
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}








  async handleUnfollow(tenantId, lineUserId) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    try {
      const result = await LineUser.findOneAndUpdate(
        { tenantId: effectiveTenantId, lineUserId },
        { 
          status: 'inactive',
          lastInteraction: new Date()
        }
      );
      return result;
    } catch (error) {
      console.error('Unfollow handling error:', error);
      throw error;
    }
  }

  async getTemplates(tenantId) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    return await LineTemplate.find({ tenantId: effectiveTenantId }).sort({ type: 1, updatedAt: -1 });
  }

  async saveTemplate(tenantId, templateData) {
    const effectiveTenantId = this.getEffectiveTenantId(tenantId);
    const { _id, ...templateFields } = templateData;
    
    try {
      if (_id) {
        return await LineTemplate.findByIdAndUpdate(
          _id,
          { 
            ...templateFields,
            tenantId: effectiveTenantId,
            updatedAt: new Date()
          },
          { new: true }
        );
      }
      
      return await LineTemplate.create({
        ...templateFields,
        tenantId: effectiveTenantId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Save template error:', error);
      throw error;
    }
  }

  async deleteTemplate(templateId) {
    try {
      const result = await LineTemplate.findByIdAndDelete(templateId);
      return result;
    } catch (error) {
      console.error('Delete template error:', error);
      throw error;
    }
  }
  async generateConnectionToken(reservationId) {
    try {
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
  
      // トークンを文字列として返す（オブジェクトではなく）
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  
      await Reservation.findByIdAndUpdate(reservationId, {
        $set: {
          lineConnection: {
            token,
            expiresAt,
            status: 'pending'
          }
        }
      });
  
      // 文字列のトークンのみを返す
      return token;  // ここを修正
  
    } catch (error) {
      console.error('Token generation error:', error);
      throw new Error(`Failed to initialize connection: ${error.message}`);
    }
  }

// トークンによる予約情報の検証と紐付け
async validateAndConnectWithToken(token, lineUserId) {
  try {
    const reservation = await Reservation.findOne({
      'lineConnection.token': token,
      'lineConnection.expiresAt': { $gt: new Date() },
      'lineConnection.status': 'pending'
    });

    if (!reservation) {
      console.log('Invalid or expired token:', token);
      return null;
    }

    const updatedReservation = await Reservation.findByIdAndUpdate(
      reservation._id,
      {
        'lineConnection.status': 'connected',
        'lineConnection.lineUserId': lineUserId,
        'lineConnection.connectedAt': new Date()
      },
      { new: true }
    );

    return updatedReservation;
  } catch (error) {
    console.error('Token validation error:', error);
    throw error;
  }
}



















async handleNewReservation(reservation) {
  try {
    console.log('\n=== Handling New Reservation ===', {
      id: reservation._id,
      email: reservation.customerInfo.email,
      datetime: reservation.datetime
    });

    // 1. LINE User検索の改善
    const lineUser = await LineUser.findOne({
      'emails.email': reservation.customerInfo.email,
      status: 'active'
    });

    console.log('LINE User search result:', {
      found: !!lineUser,
      userId: lineUser?.lineUserId,
      emails: lineUser?.emails
    });

    if (lineUser) {
      // 2. 予約情報の更新
      const updatedReservation = await Reservation.findByIdAndUpdate(
        reservation._id,
        {
          $set: {
            'lineConnection.status': 'connected',
            'lineConnection.lineUserId': lineUser.lineUserId,
            'lineConnection.connectedAt': new Date()
          }
        },
        { new: true }
      );

      // 3. テンプレート取得の改善
      const template = await LineTemplate.findOne({
        $or: [
          { tenantId: reservation.clientId, type: 'confirmation' },
          { tenantId: 'default', type: 'confirmation' }
        ],
        isActive: true
      });

      if (!template) {
        console.warn('No active confirmation template found');
        return;
      }

      // 4. メッセージ作成
      const message = this.replaceTemplateVariables(template.content, updatedReservation);

      // 5. キューを使用したメッセージ送信
      const queueResult = await lineQueueService.addToQueue({
        tenantId: updatedReservation.clientId || 'default',
        lineUserId: lineUser.lineUserId,
        message,
        reminderType: 'confirmation'
      });

      console.log('Reservation notification queued:', {
        success: queueResult.success,
        reservationId: updatedReservation._id,
        lineUserId: lineUser.lineUserId,
        messageId: queueResult.messageId
      });

      // 6. 送信結果の記録
      await LineMessage.create({
        tenantId: updatedReservation.clientId || 'default',
        lineUserId: lineUser.lineUserId,
        messageType: 'text',
        reminderType: 'confirmation',
        content: message,
        status: queueResult.success ? 'sent' : 'failed',
        sentAt: new Date(),
        metadata: {
          messageId: queueResult.messageId,
          requestId: queueResult.requestId
        }
      });

    } else {
      console.log('No LINE connection found for email:', reservation.customerInfo.email);
    }

  } catch (error) {
    console.error('Error in handleNewReservation:', {
      error: error.message,
      stack: error.stack,
      reservationId: reservation._id
    });
    
    // エラーを記録
    await LineMessage.create({
      tenantId: reservation.clientId || 'default',
      lineUserId: reservation.lineConnection?.lineUserId,
      messageType: 'text',
      reminderType: 'confirmation',
      status: 'failed',
      error: {
        message: error.message,
        details: error.stack
      }
    });
  }
}



























// line.service.js// line.service.js// line.service.js
// line.service.js
async handleFollow(tenantId, lineUserId, token) {
  try {
    console.log('\n=== Follow Event Processing ===');
    console.log('1. Initial Input:', { 
      tenantId, 
      lineUserId, 
      token,
      timestamp: new Date().toISOString()
    });

    if (token) {
      // デバッグメッセージを送信（テスト用）
      await this.sendMessage(
        tenantId,
        lineUserId,
        `デバッグ情報:\n連携トークン: ${token.substring(0, 10)}...\n時刻: ${new Date().toISOString()}`
      );

      const existingReservation = await Reservation.findOne({
        'lineConnection.token': token
      });

      console.log('2. Reservation lookup result:', {
        found: !!existingReservation,
        reservationId: existingReservation?._id,
        email: existingReservation?.customerInfo?.email,
        status: existingReservation?.lineConnection?.status,
        currentLineUserId: existingReservation?.lineConnection?.lineUserId,
        tokenMatch: token === existingReservation?.lineConnection?.token
      });

      if (existingReservation) {
        if (existingReservation.lineConnection.status === 'connected') {
          console.log('Reservation already connected');
          // 既に連携済みの場合は成功として扱う
          return {
            success: true,
            status: 'already_connected',
            reservationId: existingReservation._id
          };
        }

        // pending状態の場合のみ更新
        const updated = await Reservation.findByIdAndUpdate(
          existingReservation._id,
          {
            $set: {
              'lineConnection.status': 'connected',
              'lineConnection.lineUserId': lineUserId,
              'lineConnection.connectedAt': new Date()
            }
          },
          { new: true }
        );

        console.log('Updated reservation:', {
          id: updated._id,
          status: updated.lineConnection.status
        });

        await this.sendMessage(
          tenantId,
          lineUserId,
          '予約との連携が完了しました。'
        );
      }
    }

    // LINE登録情報の更新（既存の処理）
    const lineUser = await LineUser.findOneAndUpdate(
      { lineUserId },
      { 
        tenantId,
        status: 'active',
        lastInteraction: new Date()
      },
      { upsert: true, new: true }
    );

    return {
      success: true,
      lineUserId: lineUser.lineUserId,
      status: lineUser.status
    };

  } catch (error) {
    console.error('Follow handling error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
}


export default new LineService();