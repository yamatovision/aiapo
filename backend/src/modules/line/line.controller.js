// line.controller.js

import { validateSignature } from '@line/bot-sdk';
import lineService from './line.service.js';
import { LineUser, LineTemplate } from './line.model.js';
import { Reservation } from '../calendar/calendar.model.js';
import lineAuthService from './line-auth.service.js';

class LineController {
  constructor() {
    this.handleWebhook = this.handleWebhook.bind(this);
  }

  async generateLoginUrl(req, res) {
    try {
      const { reservationId } = req.body;
      
      if (!reservationId) {
        return res.status(400).json({
          error: 'Reservation ID is required'
        });
      }
  
      const url = lineAuthService.generateAuthUrl(reservationId);
      
      res.json({ 
        success: true,
        url 
      });
    } catch (error) {
      console.error('Generate login URL error:', error);
      res.status(500).json({
        error: 'Failed to generate login URL',
        message: error.message
      });
    }
  }
  
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['code', 'state']
        });
      }
  
      const result = await lineAuthService.handleCallback(code, state);
      
      // HTML形式のレスポンスを返す
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>LINE連携完了</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .success-icon {
                color: #4CAF50;
                font-size: 48px;
                margin-bottom: 16px;
              }
              .message {
                color: #333;
                margin-bottom: 8px;
              }
              .sub-message {
                color: #666;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✓</div>
              <h2 class="message">LINE連携が完了しました</h2>
              <p class="sub-message">このウィンドウは自動的に閉じられます</p>
            </div>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
        </html>
      `);
  
    } catch (error) {
      console.error('Callback handling error:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>エラー</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .error-icon {
                color: #f44336;
                font-size: 48px;
                margin-bottom: 16px;
              }
              .message {
                color: #333;
                margin-bottom: 8px;
              }
              .error-message {
                color: #f44336;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">⚠</div>
              <h2 class="message">エラーが発生しました</h2>
              <p class="error-message">${error.message}</p>
            </div>
            <script>
              setTimeout(() => {
                window.close();
              }, 5000);
            </script>
          </body>
        </html>
      `);
    }
  }


async handleWebhook(req, res) {
  try {
    console.log('\n=== Webhook Event Debug ===');
    console.log('Request Headers:', req.headers);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    const signature = req.headers['x-line-signature'];
    if (!validateSignature(JSON.stringify(req.body), process.env.LINE_CHANNEL_SECRET, signature)) {
      console.error('Invalid LINE signature');
      return res.status(403).send('Invalid signature');
    }

    const events = req.body.events;
    const tenantId = req.params.tenantId || 'default';
    
    for (const event of events) {
      try {
        console.log('Processing event:', event);
        const userId = event.source?.userId;
        
        if (!userId) {
          console.warn('No userId found in event:', event);
          continue;
        }

        const token = this.extractTokenFromEvent(event);
        console.log('Extracted token:', token);

        switch (event.type) {
          case 'follow':
            // 予約データからメールアドレスを取得
            let email = null;
            if (token) {
              const reservation = await Reservation.findOne({
                'lineConnection.token': token
              });
              email = reservation?.customerInfo?.email;
            }

            console.log('Follow event received:', {
              userId,
              email,
              token
            });

            const result = await lineService.handleFollow(tenantId, userId, token, email);
            console.log('Follow handling result:', result);
            break;
            
          case 'unfollow':
            await lineService.handleUnfollow(tenantId, userId);
            break;
        }
      } catch (eventError) {
        console.error('Error processing event:', {
          type: event.type,
          error: eventError.message,
          stack: eventError.stack
        });
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}





  async handleInstantReply(tenantId, userId) {
    try {
      const instantTemplate = await LineTemplate.findOne({
        tenantId: tenantId || 'default',
        type: 'instant',
        isActive: true
      });

      if (instantTemplate) {
        await lineService.sendMessage(
          tenantId,
          userId,
          instantTemplate.content
        );
      }
    } catch (error) {
      console.error('Instant reply error:', error);
    }
  }
// line.controller.js に追加
async getLineStatuses(req, res) {
  try {
    // アクティブなLINE連携情報を取得
    const lineUsers = await LineUser.find({ 
      status: 'active' 
    })
    .select('reservationId lineUserId lastInteraction')
    .lean();

    // 予約IDをキーとしたオブジェクトを作成
    const statusMap = lineUsers.reduce((acc, user) => {
      if (user.reservationId) {  // reservationIdの存在チェックを追加
        acc[user.reservationId.toString()] = {
          enabled: true,
          lineUserId: user.lineUserId,
          lastInteraction: user.lastInteraction
        };
      }
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
}
  async enableNotification(req, res) {
    try {
      const { reservationId, lineUserId } = req.body;
      
      console.log('Enable Notification Debug:', {
        reservationId,
        lineUserId,
        body: req.body
      });
  
      if (!reservationId || !lineUserId) {
        return res.status(400).json({ 
          error: 'Missing required parameters',
          required: ['reservationId', 'lineUserId']
        });
      }
  
      // 予約の存在確認を追加
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({ 
          error: 'Reservation not found',
          reservationId 
        });
      }
  
      const result = await lineService.enableNotification(
        req.params.tenantId || 'default',
        reservationId,
        lineUserId
      );
  
      res.status(200).json({ 
        success: true,
        result
      });
    } catch (error) {
      console.error('Enable notification error:', error);
      res.status(500).json({ 
        error: 'Failed to enable notification',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async sendReminder(req, res) {
    try {
      const { reservationId, type } = req.body;
      
      if (!reservationId || !type) {
        return res.status(400).json({ 
          error: 'Missing required parameters',
          required: ['reservationId', 'type']
        });
      }
  
      const result = await lineService.sendReminder(reservationId, type);
      res.status(200).json({ success: true, result });
    } catch (error) {
      console.error('Send reminder error:', error);
      res.status(500).json({ 
        error: 'Failed to send reminder',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async checkConnection(req, res) {
    try {
      const { reservationId } = req.params;
      if (!reservationId) {
        return res.status(400).json({ 
          error: 'Reservation ID is required'
        });
      }

      const lineUser = await LineUser.findOne({ 
        reservationId,
        status: 'active'
      });

      res.status(200).json({ 
        connected: !!lineUser,
        lastInteraction: lineUser?.lastInteraction
      });
    } catch (error) {
      console.error('Check connection error:', error);
      res.status(500).json({ 
        error: 'Failed to check connection',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getTemplates(req, res) {
    try {
      const templates = await lineService.getTemplates(req.params.tenantId);
      res.status(200).json(templates);
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({ 
        error: 'Failed to get templates',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async saveTemplate(req, res) {
    try {
      const templateData = req.body;

      const requiredFields = ['name', 'type', 'content'];
      if (templateData.type === 'custom') {
        requiredFields.push('reminderMinutes', 'displayName');
      }
      
      const missingFields = requiredFields.filter(field => !templateData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: missingFields
        });
      }

      // type別のバリデーション
      if (templateData.type === 'custom' && !Number.isInteger(templateData.reminderMinutes)) {
        return res.status(400).json({
          error: 'Invalid reminderMinutes value',
          details: 'reminderMinutes must be an integer'
        });
      }

      const template = await lineService.saveTemplate(req.params.tenantId, templateData);
      res.status(200).json(template);
    } catch (error) {
      console.error('Save template error:', error);
      res.status(500).json({ 
        error: 'Failed to save template',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }


  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;
      if (!templateId) {
        return res.status(400).json({ 
          error: 'Template ID is required' 
        });
      }

      const template = await LineTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({ 
          error: 'Template not found' 
        });
      }

      await lineService.deleteTemplate(templateId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({ 
        error: 'Failed to delete template',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async toggleTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { isActive } = req.body;

      if (!templateId || isActive === undefined) {
        return res.status(400).json({ 
          error: 'Missing required parameters',
          required: ['templateId', 'isActive']
        });
      }

      const template = await LineTemplate.findOneAndUpdate(
        { _id: templateId },
        { isActive, updatedAt: new Date() },
        { new: true }
      );

      if (!template) {
        return res.status(404).json({ 
          error: 'Template not found' 
        });
      }

      res.status(200).json(template);
    } catch (error) {
      console.error('Toggle template error:', error);
      res.status(500).json({ 
        error: 'Failed to toggle template',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }


  extractTokenFromEvent(event) {
    try {
      // QRコードやボタンクリックからの追加の場合
      if (event.type === 'follow') {
        // 追加時のURLパラメータからトークンを取得
        const urlParams = new URLSearchParams(event.postback?.data || '');
        const token = urlParams.get('token');
        
        console.log('Follow event token extraction:', {
          eventType: event.type,
          token: token,
          rawData: event.postback?.data
        });
        
        return token;
      }
      return null;
    } catch (error) {
      console.error('Token extraction error:', error);
      return null;
    }
  }
  async handleWebhook(req, res) {
    try {
      console.log('\n=== Webhook Event Debug ===');
      console.log('1. Webhook received at:', new Date().toISOString());
      console.log('2. Raw Body:', JSON.stringify(req.body, null, 2));
  
      // 署名検証
      const signature = req.headers['x-line-signature'];
      if (!validateSignature(JSON.stringify(req.body), process.env.LINE_CHANNEL_SECRET, signature)) {
        console.error('Invalid LINE signature');
        return res.status(403).send('Invalid signature');
      }
  
      const events = req.body.events;
      const tenantId = req.params.tenantId || 'default';
      
      for (const event of events) {
        try {
          const userId = event.source?.userId;
          if (!userId) {
            console.warn('3. No userId found in event:', event);
            continue;
          }
  
          // トークン抽出を一度だけ行う
          let token = null;
          if (event.type === 'follow') {
            token = this.extractTokenFromEvent(event);
            console.log('4. Follow event details:', {
              timestamp: new Date().toISOString(),
              userId: userId,
              urlParams: event.postback?.data,
              token: token,
              message: 'Friend addition event received'
            });
  
            // 予約情報の確認
            if (token) {
              const reservation = await Reservation.findOne({
                'lineConnection.token': token,
                'lineConnection.status': 'pending'
              });
              console.log('5. Found reservation:', {
                exists: !!reservation,
                id: reservation?._id,
                email: reservation?.customerInfo?.email
              });
            }
  
            const result = await lineService.handleFollow(tenantId, userId, token);
            console.log('6. Follow handling result:', result);
          } else if (event.type === 'unfollow') {
            await lineService.handleUnfollow(tenantId, userId);
          } else if (event.type === 'message' && event.message?.type === 'text') {
            await this.handleInstantReply(tenantId, userId);
          }
        } catch (eventError) {
          console.error('Event processing error:', {
            type: event.type,
            error: eventError.message,
            stack: eventError.stack
          });
        }
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  extractTokenFromEvent = (event) => {
    try {
      // フォローイベントの場合
      if (event.type === 'follow') {
        // LINEアプリからの追加URLに含まれるクエリパラメータを取得
        const rawUrl = event?.postback?.data || event?.source?.richMenu || '';
        console.log('Follow URL:', rawUrl);  // デバッグログ追加
        
        // URLからトークンを抽出
        const tokenMatch = rawUrl.match(/[?&]token=([^&]+)/);
        const token = tokenMatch ? tokenMatch[1] : null;
        
        console.log('Extracted token:', token);  // デバッグログ追加
        return token;
      }
      return null;
    } catch (error) {
      console.error('Token extraction error:', error);
      return null;
    }
  }







  async initializeConnection(req, res) {
    try {
      const { reservationId } = req.body;
      const token = await lineService.generateConnectionToken(reservationId);
      res.json({ token });
    } catch (error) {
      console.error('Initialize connection error:', error);
      res.status(500).json({ 
        error: 'Failed to initialize connection',
        message: error.message 
      });
    }
  }
  
  async getConnectionStatus(req, res) {
    try {
      const { reservationId } = req.params;
      const reservation = await Reservation.findById(reservationId);
      
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
  
      res.json({
        status: reservation.lineConnection?.status || 'pending',
        connected: reservation.lineConnection?.status === 'connected'
      });
    } catch (error) {
      console.error('Get connection status error:', error);
      res.status(500).json({ 
        error: 'Failed to get connection status',
        message: error.message 
      });
    }
  }
  // LINE連携状態チェックエンドポイントの修正
  async checkConnection(req, res) {
    try {
      const { reservationId } = req.params;
      if (!reservationId) {
        return res.status(400).json({ 
          error: 'Reservation ID is required'
        });
      }

      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        return res.status(404).json({
          error: 'Reservation not found'
        });
      }

      // 連携状態を返す
      res.status(200).json({ 
        connected: reservation.lineConnection?.status === 'connected',
        status: reservation.lineConnection?.status || 'pending',
        connectedAt: reservation.lineConnection?.connectedAt
      });
    } catch (error) {
      console.error('Check connection error:', error);
      res.status(500).json({ 
        error: 'Failed to check connection',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

export default new LineController();