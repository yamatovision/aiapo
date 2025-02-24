// src/modules/line/line-auth.service.js

import axios from 'axios';
import { LineUser } from './line.model.js';
import { Reservation } from '../calendar/calendar.model.js';
import mongoose from 'mongoose';
import lineService from './line.service.js';
import lineQueueService from './line-queue.service.js';
import { LineTemplate } from './line.model.js';

// LINE接続ログのスキーマ定義
const lineConnectionLogSchema = new mongoose.Schema({
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true
  },
  lineUserId: String,
  status: {
    type: String,
    enum: ['success', 'error'],
    required: true
  },
  details: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const LineConnectionLog = mongoose.model('LineConnectionLog', lineConnectionLogSchema);

class LineAuthService {
  constructor() {
    this.channelId = "2006954794";
    this.channelSecret = "daa64c233f6a67561e94b4562153592b";

    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://aibookingbot-backend-235426778039.asia-northeast1.run.app'
      : 'https://9dcd-211-14-195-212.ngrok-free.app';

    this.callbackUrl = `${baseUrl}/api/line/auth/callback`;

    console.log('LINE Auth Service Initialized:', {
      channelId: this.channelId,
      callbackUrl: this.callbackUrl,
      env: process.env.NODE_ENV
    });
  }

  generateAuthUrl(state) {
    console.log('\n=== Generating LINE Auth URL ===');
    console.log('State:', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.channelId,
      redirect_uri: this.callbackUrl,
      state: state,
      scope: 'profile',
      bot_prompt: 'aggressive'
    });

    const url = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
    console.log('Generated URL:', url);
    
    return url;
  }

  async handleCallback(code, state) {
    console.log('\n=== LINE Login Callback Processing ===');
    console.log('Start time:', new Date().toISOString());
    console.log('Parameters:', { state });

    try {
      // 1. アクセストークンの取得
      console.log('1. Requesting access token...');
      const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.callbackUrl,
        client_id: this.channelId,
        client_secret: this.channelSecret
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      console.log('Access token received:', !!access_token);

      // 2. ユーザープロフィールの取得
      console.log('2. Fetching user profile...');
      const profileResponse = await axios.get('https://api.line.me/v2/profile', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const { userId, displayName, pictureUrl } = profileResponse.data;
      console.log('Profile received:', {
        userId: userId.substring(0, 10) + '...',
        displayName
      });

      // 3. 予約情報の検証
      console.log('3. Validating reservation...');
      const reservation = await Reservation.findById(state);
      
      if (!reservation) {
        console.error('Reservation not found:', state);
        throw new Error('予約情報が見つかりません');
      }

      console.log('Reservation found:', {
        id: reservation._id,
        status: reservation.status,
        currentLineConnection: reservation.lineConnection
      });

      // 4. LINE連携情報の更新
      console.log('4. Updating LINE user information...');
      const lineUser = await LineUser.findOneAndUpdate(
        { lineUserId: userId },
        {
          $set: {
            lineUserId: userId,
            reservationId: state,
            status: 'active',
            email: reservation.customerInfo.email,
            lastInteraction: new Date()
          },
          $addToSet: {  // メールアドレス履歴に追加
            emails: {
              email: reservation.customerInfo.email,
              reservationId: state,
              addedAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );

      console.log('LINE user updated:', {
        id: lineUser._id,
        status: lineUser.status
      });

      // 5. 予約情報の更新
      const updatedReservation = await Reservation.findByIdAndUpdate(
        state,
        {
          $set: {
            'lineConnection.status': 'connected',
            'lineConnection.lineUserId': userId,
            'lineConnection.connectedAt': new Date()
          }
        },
        { new: true }
      );
  
      console.log('Reservation updated:', {
        id: updatedReservation._id,
        lineStatus: updatedReservation.lineConnection.status
      });
  
      // 6. 【追加】予約完了通知の送信
      try {
        console.log('Sending reservation confirmation...');
        
        // テンプレートの取得
        const template = await LineTemplate.findOne({
          $or: [
            { tenantId: updatedReservation.clientId, type: 'confirmation' },
            { tenantId: 'default', type: 'confirmation' }
          ],
          isActive: true
        });
  
        if (!template) {
          throw new Error('No active confirmation template found');
        }
  
        // メッセージの作成
        const message = lineService.replaceTemplateVariables(
          template.content, 
          updatedReservation
        );
  
        // キューを使用したメッセージ送信
        const queueResult = await lineQueueService.addToQueue({
          tenantId: updatedReservation.clientId || 'default',
          lineUserId: userId,
          message,
          reminderType: 'confirmation'
        });
  
        console.log('Confirmation message queued:', {
          success: queueResult.success,
          messageId: queueResult.messageId
        });
  
      } catch (notificationError) {
        console.error('Failed to send confirmation message:', notificationError);
        // 通知エラーは全体の処理を中断しない
      }
  
      // ... 既存の成功レスポンス ...
  
    } catch (error) {
      console.error('LINE Login Error:', error);
      throw error;
    }
  }

  // 接続履歴の取得メソッド
  async getConnectionHistory(reservationId) {
    return await LineConnectionLog.find({ reservationId })
      .sort({ createdAt: -1 })
      .limit(10);
  }

  // 接続状態の確認メソッド
  async checkConnectionStatus(reservationId) {
    try {
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const lineUser = await LineUser.findOne({
        reservationId,
        status: 'active'
      });

      return {
        connected: !!lineUser,
        status: reservation.lineConnection?.status || 'pending',
        lastInteraction: lineUser?.lastInteraction
      };
    } catch (error) {
      console.error('Connection status check error:', error);
      throw error;
    }
  }
}

export default new LineAuthService();