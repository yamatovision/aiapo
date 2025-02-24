import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// dotenvの設定
dotenv.config({ path: resolve(rootDir, '.env') });

// 環境設定のインポート
import './config/env.js';
import { bluelampSyncService } from './modules/auth/bluelamp-sync.service.js';

import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database.js';
import claudeRoutes from './modules/claude/claude.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import emailRoutes from './modules/email/email.routes.js';
import lineRoutes from './modules/line/line.routes.js';
import { emailController } from './modules/email/email.controller.js';
import lineScheduler from './modules/line/line.scheduler.js';
import authRoutes from './modules/auth/auth.routes.js';
import { authMiddleware, superadminMiddleware } from './modules/auth/auth.middleware.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());



// oauth2callbackは認証不要
app.get('/oauth2callback', emailController.handleOAuth2Callback);

// ヘルスチェックは認証不要
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    lastScheduleCheck: new Date().toISOString(),
    cronStatus: 'active'
  });
});

// ユーザー管理ルート（認証 + スーパー管理者権限が必要）
app.use('/api/auth', authRoutes);


// 認証が必要な一般ルート
app.use('/api/claude', authMiddleware, claudeRoutes);
app.use('/api/calendar', authMiddleware, calendarRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/email', authMiddleware, emailRoutes);

// LINEのデバッグログと認証を適用
app.use('/api/line', authMiddleware, (req, res, next) => {
  console.log('\n=== LINE API Request Debug ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Query:', req.query);
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================\n');
  next();
});
app.use('/api/line', authMiddleware, lineRoutes);

// グレースフルシャットダウン
process.on('SIGTERM', async () => {
  console.log('SIGTERM received');
  await bluelampSyncService.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received');
  await bluelampSyncService.cleanup();
  process.exit(0);
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });

  res.status(err.status || 500).json({ 
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : '内部サーバーエラーが発生しました',
    error: process.env.NODE_ENV === 'development' ? {
      name: err.name,
      stack: err.stack
    } : undefined
  });
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '要求されたリソースが見つかりません'
  });
});

// サーバー起動
async function startServer() {
  try {
    await connectDB();
    console.log('✅ データベース接続成功');

    await bluelampSyncService.initialize();
    console.log('✅ Bluelamp同期サービス初期化成功');

    lineScheduler.start();
    console.log('✅ LINEスケジューラー起動成功');

    app.listen(PORT, () => {
      console.log(`
========================================
🚀 サーバー起動完了
�� ポート: ${PORT}
🌍 環境: ${process.env.NODE_ENV}
========================================
      `);
    });
  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
}

startServer();
