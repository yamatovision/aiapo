// line-queue.service.js
import lineRetryService from './line-retry.service.js';  // インポートを追加
import lineService from './line.service.js';

class LineQueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.rateLimit = {
      maxRequests: 1000,  // LINE APIの制限に基づく
      interval: 60000,    // 1分
      currentRequests: 0
    };
  }
  async addToQueue(task) {
    try {
      const result = await lineService.sendMessage(
        task.tenantId,
        task.lineUserId,
        task.message,
        task.reminderType
      );
  
      // 結果オブジェクトをそのまま返す
      return {
        success: true,
        messageId: result.messageId,
        requestId: result.requestId,
        sentMessages: result.sentMessages
      };
    } catch (error) {
      console.error('Queue processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        if (await this.checkRateLimit()) {
          const task = this.queue.shift();
          try {
            await this.processTask(task);
            this.rateLimit.currentRequests++;
          } catch (error) {
            await this.handleTaskError(task, error);
          }
        } else {
          // レート制限に達した場合は待機
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async checkRateLimit() {
    if (this.rateLimit.currentRequests >= this.rateLimit.maxRequests) {
      return false;
    }
    return true;
  }

  async processTask(task) {
    const { lineUserId, message, reminderType, tenantId } = task;
    return await lineService.sendMessage(tenantId, lineUserId, message, reminderType);
  }
  async handleTaskError(task, error) {
    if (task.retryCount < 3) {
      // リトライ対象のタスクを再度キューに追加
      this.queue.push({
        ...task,
        retryCount: task.retryCount + 1,
        lastError: error.message
      });
    } else {
      // リトライ上限に達した場合はエラー記録
      await lineRetryService.logFailedTask(task, error);
    }
  }

  // キューの状態を確認
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      rateLimit: {
        ...this.rateLimit,
        remainingRequests: this.rateLimit.maxRequests - this.rateLimit.currentRequests
      }
    };
  }
}

export default new LineQueueService();