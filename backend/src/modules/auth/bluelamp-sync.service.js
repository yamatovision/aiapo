import { MongoClient } from 'mongodb';
import { authService } from './auth.service.js';

class BluelampSyncService {
  constructor() {
    this.mongoClient = new MongoClient(process.env.BLUELAMP_MONGODB_URI);
    this.changeStream = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      await this.mongoClient.connect();
      console.log('Bluelamp MongoDB connected');

      const collection = this.mongoClient.db().collection('users');
      
      // Change Streamの設定
      this.changeStream = collection.watch(
        [{ $match: { operationType: { $in: ['insert', 'update'] } } }],
        { fullDocument: 'updateLookup' }
      );

      // 変更検知のリスナー設定
      this.changeStream.on('change', async (change) => {
        try {
          await this.handleUserChange(change);
        } catch (error) {
          console.error('Error handling user change:', error);
        }
      });

      this.isConnected = true;
      console.log('Bluelamp sync service initialized');

    } catch (error) {
      console.error('Failed to initialize Bluelamp sync:', error);
      throw error;
    }
  }

  async handleUserChange(change) {
    const userData = change.fullDocument;
    if (!userData) return;

    console.log('Processing user change:', {
      email: userData.email,
      userRank: userData.userRank,
      operation: change.operationType
    });

    try {
      await authService.syncBluelampUser({
        email: userData.email,
        password: userData.password,
        userRank: userData.userRank,
        clientId: userData.clientId || 'default'
      });

      console.log('User sync completed:', userData.email);
    } catch (error) {
      console.error('Failed to sync user:', error);
    }
  }

  async cleanup() {
    if (this.changeStream) {
      await this.changeStream.close();
    }
    await this.mongoClient.close();
    this.isConnected = false;
  }
}

export const bluelampSyncService = new BluelampSyncService();
