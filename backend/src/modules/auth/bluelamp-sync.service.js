import { MongoClient } from 'mongodb';
import { authService } from './auth.service.js';
import { ClientIdGenerator } from '../utils/client-id-generator.js';

class BluelampSyncService {
  constructor() {
    this.mongoClient = new MongoClient(process.env.BLUELAMP_MONGODB_URI);
    this.changeStream = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      await this.mongoClient.connect();
      console.log('🔌 Bluelamp MongoDB接続成功');

      const collection = this.mongoClient.db().collection('users');
      
      // Change Streamの設定
      this.changeStream = collection.watch(
        [{ $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }],
        { fullDocument: 'updateLookup' }
      );

      // 変更検知のリスナー設定
      this.changeStream.on('change', async (change) => {
        try {
          await this.handleUserChange(change);
        } catch (error) {
          console.error('❌ ユーザー変更処理エラー:', error);
        }
      });

      this.isConnected = true;
      console.log('✅ Bluelamp同期サービス初期化完了');

    } catch (error) {
      console.error('❌ Bluelamp同期初期化エラー:', error);
      throw error;
    }
  }

  async handleUserChange(change) {
    console.log('🔄 ユーザー変更検知:', {
      operationType: change.operationType,
      documentId: change.documentKey._id
    });

    try {
      switch (change.operationType) {
        case 'insert':
        case 'update':
          await this.handleUpsertUser(change.fullDocument);
          break;
        case 'delete':
          await this.handleDeleteUser(change.documentKey._id);
          break;
      }
    } catch (error) {
      console.error('❌ ユーザー変更処理エラー:', error);
    }
  }

  async handleUpsertUser(bluelampUser) {
    if (!bluelampUser) return;

    console.log('📝 ユーザー同期処理開始:', {
      email: bluelampUser.email,
      userRank: bluelampUser.userRank,
      name: bluelampUser.name
    });

    try {
      // クライアントIDの取得または生成
      let clientId = bluelampUser.clientId;
      if (!clientId || !ClientIdGenerator.validateClientId(clientId)) {
        clientId = await ClientIdGenerator.generateClientId();
      }

      const userData = {
        email: bluelampUser.email,
        name: bluelampUser.name || bluelampUser.email.split('@')[0],
        password: bluelampUser.password, // ハッシュ化されたパスワードをそのまま同期
        userRank: bluelampUser.userRank,
        clientId: clientId,
        role: bluelampUser.userRank === '管理者' ? 'superadmin' : 'admin',
        status: bluelampUser.userRank === '退会者' ? 'withdrawn' : 'active',
        lastLogin: bluelampUser.lastLogin
      };

      const user = await authService.syncBluelampUser(userData);
      
      console.log('✅ ユーザー同期完了:', {
        email: user.email,
        name: user.name,
        clientId: user.clientId,
        role: user.role,
        status: user.status
      });

      return user;
    } catch (error) {
      console.error('❌ ユーザー同期エラー:', error);
      throw error;
    }
  }

  async handleDeleteUser(userId) {
    console.log('🗑️ ユーザー削除検知:', { bluelampUserId: userId });

    try {
      // ユーザーを無効化（完全削除ではなく）
      const user = await authService.updateUser(userId, {
        status: 'withdrawn',
        role: 'none',
        userRank: '退会者',
        updatedAt: new Date()
      });

      if (user) {
        console.log('✅ ユーザー無効化完了:', {
          email: user.email,
          status: user.status,
          role: user.role
        });
      }
    } catch (error) {
      console.error('❌ ユーザー無効化エラー:', error);
    }
  }

  // ユーザーデータの同期状態を確認
  async validateUserSync(bluelampUser, aiApoUser) {
    if (!aiApoUser) return false;

    return (
      bluelampUser.email === aiApoUser.email &&
      bluelampUser.userRank === aiApoUser.userRank &&
      bluelampUser.password === aiApoUser.password &&
      (bluelampUser.name || bluelampUser.email.split('@')[0]) === aiApoUser.name
    );
  }

  // 同期状態チェック
  async healthCheck() {
    return {
      isConnected: this.isConnected,
      lastSyncTime: new Date(),
      status: this.isConnected ? 'active' : 'inactive'
    };
  }

  // クリーンアップ処理
  async cleanup() {
    console.log('🧹 Bluelamp同期サービスのクリーンアップ開始');
    
    if (this.changeStream) {
      await this.changeStream.close();
      console.log('✅ Change Stream終了');
    }
    
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log('✅ MongoDB接続終了');
    }
    
    this.isConnected = false;
    console.log('✅ クリーンアップ完了');
  }
}

export const bluelampSyncService = new BluelampSyncService();