// auth.service.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from './auth.model.js';

class AuthService {
  // 既存の認証メソッド
  async authenticateUser(email, password) {
    console.log('🔍 ユーザー認証開始:', { email });
    
    try {
      const user = await User.findOne({ email });

      if (!user) {
        console.log('❌ ユーザーが見つかりません:', { email });
        return {
          success: false,
          message: 'メールアドレスまたはパスワードが正しくありません'
        };
      }

      console.log('👤 ユーザー検索成功:', { 
        email: user.email,
        role: user.role,
        status: user.status 
      });

      const isMatch = await user.verifyPassword(password);
      console.log('🔐 パスワード検証結果:', { isMatch });

      if (!isMatch) {
        console.log('❌ パスワード不一致:', { email });
        return {
          success: false,
          message: 'メールアドレスまたはパスワードが正しくありません'
        };
      }

      if (!user.canLogin()) {
        console.log('❌ ログイン制限中のユーザー:', { 
          email,
          status: user.status,
          role: user.role 
        });
        return {
          success: false,
          message: 'このアカウントはアクセスが制限されています'
        };
      }

      // 最終ログイン日時の更新
      user.lastLogin = new Date();
      await user.save();

      const token = this.generateToken(user);
      console.log('✅ ログイン成功:', { 
        email: user.email,
        role: user.role 
      });

      return {
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          clientId: user.clientId
        }
      };
    } catch (error) {
      console.error('❌ 認証エラー:', error);
      throw error;
    }
  }

  async updateUser(userId, updateData) {
    console.log('📝 ユーザー更新開始:', { userId });
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          ...updateData,
          updatedAt: new Date()
        },
        { new: true }
      ).select('-password');

      if (!user) {
        console.log('❌ 更新対象のユーザーが見つかりません:', { userId });
        return null;
      }

      console.log('✅ ユーザー更新成功:', {
        userId: user._id,
        email: user.email
      });

      return user;
    } catch (error) {
      console.error('❌ ユーザー更新エラー:', error);
      throw error;
    }
  }


  // 既存のユーザー取得メソッド
  async getUserById(userId) {
    console.log('🔍 ユーザー検索:', { userId });
    try {
      const user = await User.findById(userId);
      if (user) {
        console.log('✅ ユーザー取得成功:', { 
          email: user.email,
          role: user.role 
        });
      } else {
        console.log('❌ ユーザーが見つかりません:', { userId });
      }
      return user;
    } catch (error) {
      console.error('❌ ユーザー検索エラー:', error);
      throw error;
    }
  }

  // 既存のトークン生成メソッド
  generateToken(user) {
    console.log('🎟️ トークン生成:', { userId: user._id });
    return jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        clientId: user.clientId
      },
      process.env.JWT_SECRET,
      { expiresIn: '14d' }
    );
  }

  // 既存のトークン検証メソッド
  async verifyToken(token) {
    console.log('🔍 トークン検証開始');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ トークン検証成功:', { 
        userId: decoded.userId,
        email: decoded.email 
      });
      return decoded;
    } catch (error) {
      console.error('❌ トークン検証エラー:', error);
      return null;
    }
  }

  // 新規追加: ユーザー作成メソッド
  async createUser(userData, createdBy) {
    console.log('📝 新規ユーザー作成開始:', { email: userData.email });
    try {
      // 一時パスワードの生成
      const temporaryPassword = this.generateTemporaryPassword();
      
      const newUser = await User.createNewUser({
        ...userData,
        password: temporaryPassword
      }, createdBy);

      console.log('✅ ユーザー作成成功:', {
        email: newUser.email,
        clientId: newUser.clientId
      });

      return {
        user: newUser,
        temporaryPassword
      };
    } catch (error) {
      console.error('❌ ユーザー作成エラー:', error);
      throw error;
    }
  }

  // 新規追加: ブルーランプ同期メソッド
  async syncBluelampUser(userData) {
    console.log('🔄 ブルーランプユーザー同期開始:', { email: userData.email });
    try {
      let user = await User.findOne({ email: userData.email });
      
      if (!user) {
        // 新規ユーザーの場合
        user = await User.createNewUser({
          ...userData,
          password: await bcrypt.hash(Math.random().toString(36), 10)
        });
        
        console.log('✅ 新規ユーザー作成:', { 
          email: user.email,
          clientId: user.clientId 
        });
      } else {
        // 既存ユーザーの更新
        user.userRank = userData.userRank;
        user.setRoleAndStatus(); // 既存メソッドを使用
        await user.save();
        
        console.log('✅ 既存ユーザー更新:', { 
          email: user.email,
          role: user.role,
          status: user.status 
        });
      }

      return user;
    } catch (error) {
      console.error('❌ ブルーランプ同期エラー:', error);
      throw error;
    }
  }

  // 新規追加: ユーザー一覧取得メソッド（ページネーション対応）
  async getUsers({ page = 1, limit = 10, search = '', status = '', role = '', clientId = '' }) {
    try {
      const query = {};
      
      if (search) {
        query.email = { $regex: search, $options: 'i' };
      }
      if (status) {
        query.status = status;
      }
      if (role) {
        query.role = role;
      }
      if (clientId) {
        query.clientId = clientId;
      }

      const skip = (page - 1) * limit;
      
      const [users, total] = await Promise.all([
        User.find(query)
          .skip(skip)
          .limit(Number(limit))
          .select('-password')
          .sort({ createdAt: -1 }),
        User.countDocuments(query)
      ]);

      console.log('✅ ユーザー一覧取得:', { 
        total,
        page,
        limit,
        userCount: users.length 
      });

      return {
        users,
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('❌ ユーザー一覧取得エラー:', error);
      throw error;
    }
  }

  // 新規追加: 一時パスワード生成メソッド
  generateTemporaryPassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}

export const authService = new AuthService();