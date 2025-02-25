// src/scripts/migrate-bluelamp-users.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClientIdGenerator } from '../modules/utils/client-id-generator.js';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '../../.env')
});

function generateTemporaryPassword() {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

const passwordInfo = [];

async function migrateUsers() {
  try {
    const blueLampDb = await mongoose.createConnection(process.env.BLUELAMP_MONGODB_URI);
    console.log('✅ ブルーランプDBに接続成功');

    const aiApoDb = await mongoose.createConnection(process.env.MONGODB_URI);
    console.log('✅ AIアポDBに接続成功');

    const BlueLampUser = blueLampDb.model('User', new mongoose.Schema({}, { strict: false }));
    const AiApoUser = aiApoDb.model('User', new mongoose.Schema({
      email: String,
      name: String,
      password: String,
      clientId: String,
      role: String,
      userRank: String,
      status: String
    }));

    const blueLampUsers = await BlueLampUser.find({});
    console.log(`📊 移行対象ユーザー数: ${blueLampUsers.length}`);

    let updatedCount = 0;
    let newCount = 0;
    let skippedCount = 0;

    for (const blueLampUser of blueLampUsers) {
      try {
        const existingUser = await AiApoUser.findOne({ email: blueLampUser.email });
        
        if (existingUser) {
          if (!existingUser.name || !existingUser.password) {
            const updateData = {
              name: blueLampUser.name || blueLampUser.email.split('@')[0]
            };
            if (blueLampUser.password) {
              updateData.password = blueLampUser.password;
            }
            
            await AiApoUser.findByIdAndUpdate(
              existingUser._id,
              updateData,
              { new: true }
            );
            console.log(`✅ 既存ユーザーの情報を更新: ${blueLampUser.email}`);
            updatedCount++;
          } else {
            console.log(`⏩ スキップ - 既存ユーザー: ${blueLampUser.email}`);
            skippedCount++;
          }
          continue;
        }

        const clientId = await ClientIdGenerator.generateClientId(AiApoUser);
        
        const newUserData = {
          name: blueLampUser.name || blueLampUser.email.split('@')[0],
          email: blueLampUser.email,
          clientId: clientId,
          userRank: blueLampUser.userRank,
          role: blueLampUser.userRank === '管理者' ? 'superadmin' : 'admin',
          status: blueLampUser.userRank === '退会者' ? 'withdrawn' : 'active'
        };

        // パスワードの処理
        if (blueLampUser.password) {
          newUserData.password = blueLampUser.password; // 既存のハッシュ化されたパスワードを使用
        } else {
          const tempPassword = generateTemporaryPassword();
          newUserData.password = await bcrypt.hash(tempPassword, 8);
          passwordInfo.push({
            email: blueLampUser.email,
            password: tempPassword,
            timestamp: new Date().toISOString()
          });
        }

        const newUser = new AiApoUser(newUserData);
        await newUser.save();
        
        console.log(`✅ 新規ユーザー作成成功: ${blueLampUser.email}`);
        newCount++;

      } catch (error) {
        console.error(`❌ ユーザー処理エラー (${blueLampUser.email}):`, error);
      }
    }

    if (passwordInfo.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(
        `migration-passwords-${timestamp}.json`,
        JSON.stringify(passwordInfo, null, 2)
      );
      console.log('📝 新規パスワードが必要なユーザーの情報を保存しました');
    }

    console.log('✨ 移行完了');
    console.log(`📊 処理結果:
      - 新規作成: ${newCount}件
      - 情報更新: ${updatedCount}件
      - スキップ: ${skippedCount}件- 合計処理: ${newCount + updatedCount + skippedCount}件
    `);

  } catch (error) {
    console.error('❌ 移行処理エラー:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 データベース接続を終了しました');
  }
}

migrateUsers();