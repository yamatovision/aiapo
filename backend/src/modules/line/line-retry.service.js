// line-retry.service.js

import { LineMessage } from './line.model.js';

class LineRetryService {
  constructor() {
    this.maxRetries = 3;
    this.retryIntervals = [
      5 * 60 * 1000,    // 5分
      15 * 60 * 1000,   // 15分
      60 * 60 * 1000    // 1時間
    ];
  }

  async logFailedTask(task, error) {
    try {
      await LineMessage.create({
        tenantId: task.tenantId,
        lineUserId: task.lineUserId,
        messageType: 'text',
        reminderType: task.reminderType,
        content: task.message,
        status: 'failed',
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN',
          details: error.details || null
        }
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }
      // エラー通知の送信
  

  async retryFailedMessages() {
    const failedMessages = await LineMessage.find({
      status: 'failed',
      'error.retryCount': { $lt: this.maxRetries },
      'error.lastAttempt': {
        $lt: new Date(Date.now() - this.retryIntervals[0])
      }
    }).sort({ 'error.lastAttempt': 1 });

    for (const message of failedMessages) {
      try {
        await lineQueueService.addToQueue({
          tenantId: message.tenantId,
          lineUserId: message.lineUserId,
          message: message.content,
          reminderType: message.reminderType,
          retryCount: message.error.retryCount || 0
        });
      } catch (error) {
        console.error('Retry queue error:', error);
      }
    }
  }

  async sendErrorNotification(task, error) {
    // エラー通知の実装（必要に応じて）
    console.error('LINE message error:', {
      task,
      error: error.message,
      retryCount: task.retryCount
    });
  }

  // エラー統計の取得
  async getErrorStats() {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    return await LineMessage.aggregate([
      {
        $match: {
          status: 'failed',
          createdAt: { $gte: oneDayAgo }
        }
      },
      {
        $group: {
          _id: '$error.message',
          count: { $sum: 1 },
          lastOccurred: { $max: '$createdAt' }
        }
      }
    ]);
  }
}

export default new LineRetryService();