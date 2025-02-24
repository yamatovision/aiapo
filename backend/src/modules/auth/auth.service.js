// auth.service.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from './auth.model.js';

class AuthService {
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

      const isMatch = await bcrypt.compare(password, user.password);
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


// auth.service.js
async getUsers({ page = 1, limit = 10, search = '', status = '', role = '' }) {
  try {
    const query = {};
    
    // 検索条件の構築
    if (search) {
      query.email = { $regex: search, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }
    if (role) {
      query.role = role;
    }

    // ページネーションの計算
    const skip = (page - 1) * limit;
    
    // ユーザー取得とカウント
    const [users, total] = await Promise.all([
      User.find(query)
        .skip(skip)
        .limit(Number(limit))
        .select('-password')
        .sort({ createdAt: -1 }),
      User.countDocuments(query)
    ]);

    return {
      users,
      total,
      page: Number(page),
      limit: Number(limit)
    };
  } catch (error) {
    console.error('ユーザー一覧取得エラー:', error);
    throw error;
  }
}
}

export const authService = new AuthService();