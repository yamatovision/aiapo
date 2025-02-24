import express from 'express';
import * as line from '@line/bot-sdk';  // 修正
import crypto from 'crypto';
import lineController from './line.controller.js';
import { LineUser, LineTemplate } from './line.model.js';
import lineAuthService from './line-auth.service.js';
import { Reservation } from '../calendar/calendar.model.js';  // 追加

const router = express.Router();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// カスタム署名検証ミドルウェアをwebhookルートの前に配置
const validateSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-line-signature'];
    const body = JSON.stringify(req.body);
    
    console.log('=== Webhook Debug ===');
    console.log('1. Raw Body:', body);
    console.log('2. Content-Type:', req.headers['content-type']);
    console.log('3. Body Length:', body.length);
    console.log('4. Received Signature:', signature);
    
    const isValid = line.validateSignature(
      body,
      process.env.LINE_CHANNEL_SECRET,
      signature
    );
    console.log('5. Signature Valid:', isValid);

    if (isValid) {
      next();
    } else {
      res.status(403).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Validation Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// tenantIdのミドルウェア
const handleTenantId = (req, res, next) => {
  if (!req.params.tenantId) {
    req.params.tenantId = 'default';
  }
  next();
};

// Webhookエンドポイント - カスタム署名検証を使用
router.post('/webhook', validateSignature, lineController.handleWebhook);

// 以下は既存のルート
router.post('/enable-notification', lineController.enableNotification);
router.post('/:tenantId/enable-notification', handleTenantId, lineController.enableNotification);
router.get('/check-connection/:reservationId', lineController.checkConnection);

// テンプレート管理
router.get('/templates', lineController.getTemplates);
router.post('/templates', lineController.saveTemplate);
router.put('/templates/:templateId', lineController.saveTemplate);
router.delete('/templates/:templateId', lineController.deleteTemplate);
router.put('/templates/:templateId/toggle', lineController.toggleTemplate);

router.get('/:tenantId/templates', handleTenantId, lineController.getTemplates);
router.post('/:tenantId/templates', handleTenantId, lineController.saveTemplate);
router.put('/:tenantId/templates/:templateId', handleTenantId, lineController.saveTemplate);
router.delete('/:tenantId/templates/:templateId', handleTenantId, lineController.deleteTemplate);
router.put('/:tenantId/templates/:templateId/toggle', handleTenantId, lineController.toggleTemplate);
router.post('/send-reminder', lineController.sendReminder);

router.post('/initialize-connection', lineController.initializeConnection);
router.get('/connection-status/:reservationId', lineController.getConnectionStatus);
router.post('/auth/login-url', lineController.generateLoginUrl);
router.get('/auth/callback', lineController.handleCallback);

// 連携状態確認用のエンドポイントも追加
router.get('/auth/status/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    
    const reservation = await Reservation.findById(reservationId).select('lineConnection');
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }

    res.json({
      success: true,
      status: reservation.lineConnection?.status || 'pending',
      connected: reservation.lineConnection?.status === 'connected',
      connectedAt: reservation.lineConnection?.connectedAt
    });
  } catch (error) {
    console.error('Auth status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check auth status',
      message: error.message
    });
  }
});

// テスト用のエンドポイント（開発環境のみ）
if (process.env.NODE_ENV === 'development') {
  router.post('/auth/test-connection', async (req, res) => {
    try {
      const { reservationId, lineUserId } = req.body;
      
      const result = await lineAuthService.createTestConnection(
        reservationId,
        lineUserId
      );
      
      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

// ユーザー確認エンドポイントを修正（クエリパラメータを使用）
router.get('/users/check', async (req, res) => {
  try {
    const reservationId = req.query.reservationId; // req.bodyからreq.queryに変更
    console.log('Checking LINE user for reservation:', reservationId);
    
    const lineUser = await LineUser.findOne({ 
      reservationId: reservationId,
      status: 'active' 
    }).lean();

    console.log('Found LINE user:', lineUser);

    if (!lineUser) {
      return res.json({ 
        found: false, 
        message: 'No active LINE user found for this reservation' 
      });
    }

    res.json({ 
      found: true,
      user: {
        lineUserId: lineUser.lineUserId,
        status: lineUser.status,
        lastInteraction: lineUser.lastInteraction,
        tenantId: lineUser.tenantId || 'default'
      }
    });
  } catch (error) {
    console.error('Error checking LINE user:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// line.routes.js に追加
router.put('/users/update', async (req, res) => {
  try {
    const { reservationId, lineUserId } = req.body;
    console.log('Updating LINE user:', { reservationId, lineUserId });

    // 既存のユーザーを検索
    let lineUser = await LineUser.findOne({ lineUserId });
    
    if (lineUser) {
      // 既存ユーザーの更新
      lineUser = await LineUser.findOneAndUpdate(
        { lineUserId },
        { 
          $set: { 
            reservationId,
            lastInteraction: new Date()
          }
        },
        { new: true }
      );
    } else {
      // 新規ユーザーの作成
      lineUser = await LineUser.create({
        lineUserId,
        reservationId,
        status: 'active',
        lastInteraction: new Date()
      });
    }

    res.json({
      success: true,
      user: lineUser
    });
  } catch (error) {
    console.error('Error updating LINE user:', error);
    res.status(500).json({
      error: 'Failed to update LINE user',
      message: error.message
    });
  }
});

router.get('/users/check/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const lineUser = await LineUser.findOne({ 
      reservationId,
      status: 'active'
    });
    
    res.json({
      found: !!lineUser,
      user: lineUser ? {
        lineUserId: lineUser.lineUserId,
        status: lineUser.status,
        lastInteraction: lineUser.lastInteraction
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// テンプレート取得テスト
router.get('/templates', async (req, res) => {
  try {
    const templates = await LineTemplate.find({ isActive: true });
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/test-message', async (req, res) => {
  try {
    const { lineUserId, message } = req.body;
    
    console.log('Test message configuration:', {
      lineUserId,
      message,
      hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      hasSecret: !!process.env.LINE_CHANNEL_SECRET
    });

    const client = new line.Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.LINE_CHANNEL_SECRET
    });

    const result = await client.pushMessage(lineUserId, {
      type: 'text',
      text: message
    });

    console.log('Message sent successfully:', {
      lineUserId,
      messageLength: message.length,
      result
    });

    res.json({
      success: true,
      result,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Test message error:', {
      name: error.name,
      message: error.message,
      response: error.response?.data
    });

    res.status(500).json({
      error: error.message,
      details: error.response?.data,
      timestamp: new Date()
    });
  }
});



router.get('/monitor/status', async (req, res) => {
  try {
    // 過去1時間の送信状況
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);
    
    const stats = await Promise.all([
      // 送信完了数
      ReminderHistory.countDocuments({
        status: 'sent',
        createdAt: { $gte: lastHour }
      }),
      
      // 失敗数
      ReminderHistory.countDocuments({
        status: 'failed',
        createdAt: { $gte: lastHour }
      }),
      
      // キュー待ち数
      ReminderHistory.countDocuments({
        status: 'queued'
      }),
      
      // 最新のエラー
      ReminderHistory.find({
        status: 'failed',
        createdAt: { $gte: lastHour }
      })
      .sort({ createdAt: -1 })
      .limit(5)
    ]);

    res.json({
      timestamp: new Date(),
      lastHour: {
        sent: stats[0],
        failed: stats[1],
        queued: stats[2],
      },
      recentErrors: stats[3].map(error => ({
        type: error.reminderType,
        error: error.error,
        time: error.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// line.routes.js
router.get('/statuses', async (req, res) => {
  try {
    // 予約データからLINE連携情報を取得
    const reservations = await Reservation.find({
      'lineConnection.status': 'connected'
    }).select('_id lineConnection').lean();

    // 予約IDをキーとしたマップを作成
    const statusMap = reservations.reduce((acc, reservation) => {
      acc[reservation._id.toString()] = {
        enabled: true,
        lineUserId: reservation.lineConnection.lineUserId,
        lastInteraction: reservation.lineConnection.connectedAt,
        status: reservation.lineConnection.status
      };
      return acc;
    }, {});

    res.json(statusMap);
  } catch (error) {
    console.error('Get LINE statuses error:', error);
    res.status(500).json({
      error: 'Failed to fetch LINE statuses',
      message: error.message
    });
  }
});

// 個別の予約のLINE連携状態取得
router.get('/status/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    const lineUser = await LineUser.findOne({
      reservationId,
      status: 'active'
    }).lean();

    if (!lineUser) {
      return res.json({
        enabled: false
      });
    }

    res.json({
      enabled: true,
      lineUserId: lineUser.lineUserId,
      lastInteraction: lineUser.lastInteraction
    });
  } catch (error) {
    console.error('Get LINE status error:', error);
    res.status(500).json({
      error: 'Failed to fetch LINE status',
      message: error.message
    });
  }
});

export default router;