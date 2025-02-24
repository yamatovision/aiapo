// backend/src/modules/line/line.model.js

import mongoose from 'mongoose';

// LINEユーザースキーマ（変更なし）
const lineUserSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    default: 'default',
    index: true
  },
  lineUserId: {
    type: String,
    required: true,
    index: true
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    index: true
  },
  email: {
    type: String,
    required: false, // falseに変更
    index: true
  },
  emails: [{
    email: String,
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// LINEメッセージスキーマ
const lineMessageSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    default: 'default',
    index: true
  },
  lineUserId: {
    type: String,
    required: true,
    index: true
  },
  messageType: {
    type: String,
    required: true,
    enum: ['text', 'template'],
    default: 'text'
  },
  reminderType: {
    type: String,
    required: false
  }, // enum制限を削除
  content: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    required: true
  },
  error: {
    message: String,
    code: String,
    details: mongoose.Schema.Types.Mixed
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// LINEテンプレートスキーマ（更新）
const lineTemplateSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    default: 'default',
    index: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['confirmation', 'instant', 'custom'], // instantを追加
  },
  reminderMinutes: {
    type: Number,  // 正の値は「前」、負の値は「後」
    required: function() {
      return this.type !== 'confirmation';  // confirmation以外は必須
    },
    validate: {
      validator: function(v) {
        if (this.type === 'confirmation') return true;
        return Number.isInteger(v);  // 整数値のみ許可
      },
      message: '有効な分数を指定してください'
    }
  },
  displayName: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// リマインド履歴スキーマ（更新）
const reminderHistorySchema = new mongoose.Schema({
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true,
    index: true
  },
  reminderType: {
    type: String,
    required: true
  }, // enum制限を削除
  reminderMinutes: {
    type: Number,
    required: true
  }, // 追加
  status: {
    type: String,
    enum: ['pending', 'queued', 'sent', 'failed'],
    default: 'pending'
  },
  sentAt: Date,
  error: {
    message: String,
    code: String,
    details: mongoose.Schema.Types.Mixed
  },
  retryCount: {
    type: Number,
    default: 0
  },
  queuedAt: Date,
  processedAt: Date,
  messageId: String,
  metadata: {
    requestId: String,
    messageId: String,
    originalContent: String
  }
}, {
  timestamps: true
});

// インデックスの設定（変更なし）
lineUserSchema.index({ tenantId: 1, lineUserId: 1 }, { unique: true });
lineMessageSchema.index({ tenantId: 1, sentAt: -1 });
lineTemplateSchema.index({ tenantId: 1, type: 1 });
reminderHistorySchema.index({ reservationId: 1, reminderType: 1 });
reminderHistorySchema.index({ status: 1, createdAt: -1 });
reminderHistorySchema.index({ reminderType: 1, status: 1 });

// モデルのエクスポート（変更なし）
export const LineUser = mongoose.model('LineUser', lineUserSchema);
export const LineMessage = mongoose.model('LineMessage', lineMessageSchema);
export const LineTemplate = mongoose.model('LineTemplate', lineTemplateSchema);
export const ReminderHistory = mongoose.model('ReminderHistory', reminderHistorySchema);