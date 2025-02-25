// src/scripts/migrate-bluelamp-users.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClientIdGenerator } from '../modules/utils/client-id-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み
dotenv.config({
  path: path.join(__dirname, '../../.env')
});

// 接続設定
const BLUELAMP_URI = process.env.BLUELAMP_MONGODB_URI;
const AIAPO_URI = process.env.MONGODB_URI;

async function migrateUsers() {
  try {
    // ブルーランプDBに接続
    const blueLampDb = await mongoose.createConnection(BLUELAMP_URI);
    console.log('✅ブルーランプDBに接続成功');

    // AIアポDBに接続
    const aiApoDb = await mongoose.createConnection(AIAPO_URI);
    console.log('✅ AIアポDBに接続成功');

    // ブルーランプのユーザーモデル
    const BlueLampUser = blueLampDb.model('User', new mongoose.Schema({}, { strict: false }));

    // AIアポのユーザーモデル
    const AiApoUser = aiApoDb.model('User', new mongoose.Schema({
      email: String,
      name: String,
      clientId: String,
      role: String,
      userRank: String,
      status: String
    }));

    // ブルーランプのユーザーを取得
    const blueLampUsers = await BlueLampUser.find({});
    console.log(`📊 移行対象ユーザー数: ${blueLampUsers.length}`);

    let updatedCount = 0;
    let newCount = 0;
    let skippedCount = 0;

    // ユーザーごとに処理
    for (const blueLampUser of blueLampUsers) {
      try {
        // 既存ユーザーチェック
        const existingUser = await AiApoUser.findOne({ email: blueLampUser.email });
        
        if (existingUser) {
          // 既存ユーザーの名前を更新
          if (!existingUser.name) {
            const updatedUser = await AiApoUser.findByIdAndUpdate(
              existingUser._id,
              { 
                name: blueLampUser.name || blueLampUser.email.split('@')[0]
              },
              { new: true }
            );
            console.log(`✅ 既存ユーザーの名前を更新: ${blueLampUser.email}`);
            updatedCount++;
          } else {
            console.log(`⏩ スキップ - 既存ユーザー（名前あり）: ${blueLampUser.email}`);
            skippedCount++;
          }
          continue;
        }

        // クライアントID生成
        const clientId = await ClientIdGenerator.generateClientId(AiApoUser);

        // 新規ユーザーデータ作成
        const newUser = new AiApoUser({
          name: blueLampUser.name || blueLampUser.email.split('@')[0],
          email: blueLampUser.email,
          clientId: clientId,
          userRank: blueLampUser.userRank,
          role: blueLampUser.userRank === '管理者' ? 'superadmin' : 'admin',
          status: blueLampUser.userRank === '退会者' ? 'withdrawn' : 'active'
        });

        await newUser.save();
        console.log(`✅ 新規ユーザー作成成功: ${blueLampUser.email}`);
        newCount++;

      } catch (error) {
        console.error(`❌ ユーザー処理エラー (${blueLampUser.email}):`, error);
      }
    }

    console.log('✨ 移行完了');
    console.log(`📊 処理結果:
      - 新規作成: ${newCount}件
      - 名前更新: ${updatedCount}件
      - スキップ: ${skippedCount}件- 合計処理: ${newCount + updatedCount + skippedCount}件
    `);

  } catch (error) {
    console.error('❌ 移行処理エラー:', error);
  } finally {
    // 接続を閉じる
    await mongoose.disconnect();
    await blueLampDb?.close();
    await aiApoDb?.close();
    console.log('🔌 データベース接続を終了しました');
  }
}

// 移行実行
migrateUsers();