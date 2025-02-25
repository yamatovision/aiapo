// auth.controller.js
import { authService } from './auth.service.js';

export class AuthController {
  constructor() {}

  login = async (req, res) => {
    console.log('🔑 ログインリクエスト受信:', { email: req.body.email });
    
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        console.log('❌ バリデーションエラー: メールアドレスまたはパスワードが未入力');
        res.status(400).json({
          success: false,
          message: 'メールアドレスとパスワードを入力してください'
        });
        return;
      }

      const result = await authService.authenticateUser(email, password);
      console.log('認証結果:', { 
        success: result.success, 
        email: email,
        timestamp: new Date().toISOString()
      });
      
      res.json(result);
    } catch (error) {
      console.error('❌ ログインエラー:', error);
      res.status(500).json({
        success: false,
        message: 'ログイン処理中にエラーが発生しました'
      });
    }
  };

  getCurrentUser = async (req, res) => {
    console.log('👤 ユーザー情報リクエスト受信');
    
    try {
      if (!req.user) {
        console.log('❌ 未認証アクセス');
        res.status(401).json({
          success: false,
          message: '認証が必要です'
        });
        return;
      }

      const user = await authService.getUserById(req.user.userId);
      
      if (!user) {
        console.log('❌ ユーザーが見つかりません:', req.user.userId);
        res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
        return;
      }

      console.log('✅ ユーザー情報取得成功:', { 
        userId: user._id,
        email: user.email,
        role: user.role 
      });

      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          clientId: user.clientId
        }
      });
    } catch (error) {
      console.error('❌ ユーザー情報取得エラー:', error);
      res.status(500).json({
        success: false,
        message: 'ユーザー情報の取得中にエラーが発生しました'
      });
    }
  };

  verifyToken = async (req, res) => {
    console.log('🔑 トークン検証リクエスト受信');
    
    try {
      const { token } = req.body;
      
      if (!token) {
        console.log('❌ トークンが提供されていません');
        res.status(400).json({
          success: false,
          message: 'トークンが必要です'
        });
        return;
      }

      const decoded = await authService.verifyToken(token);
      
      if (!decoded) {
        console.log('❌ 無効なトークン');
        res.status(401).json({
          success: false,
          message: '無効なトークンです'
        });
        return;
      }

      const user = await authService.getUserById(decoded.userId);
      
      if (!user) {
        console.log('❌ トークンのユーザーが見つかりません');
        res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
        return;
      }

      console.log('✅ トークン検証成功:', {
        userId: user._id,
        email: user.email
      });

      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          clientId: user.clientId
        }
      });
    } catch (error) {
      console.error('❌ トークン検証エラー:', error);
      res.status(401).json({
        success: false,
        message: 'トークンの検証に失敗しました'
      });
    }
  };



  // ユーザー一覧取得
  // getUsersメソッドの更新版
getUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      role, 
      clientId  // 新しいフィルターパラメータ
    } = req.query;

    // authServiceの拡張されたgetUsersメソッドを使用
    const result = await authService.getUsers({
      page,
      limit,
      search,
      status,
      role,
      clientId  // クライアントIDによるフィルタリングを追加
    });

    console.log('✅ ユーザー一覧取得成功:', {
      total: result.total,
      page: result.page,
      limit: result.limit,
      userCount: result.users.length
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ ユーザー一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー一覧の取得中にエラーが発生しました'
    });
  }
};

  // ユーザー詳細取得
  getUserById = async (req, res) => {
    try {
      const user = await User
        .findById(req.params.id)
        .select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('❌ ユーザー詳細取得エラー:', error);
      res.status(500).json({
        success: false,
        message: 'ユーザー情報の取得中にエラーが発生しました'
      });
    }
  };

  // ユーザー情報更新
  updateUser = async (req, res) => {
    try {
      const { email, clientId, status } = req.body;
      const userId = req.params.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
      }

      // 更新対象のフィールドを設定
      const updateData = {
        email,
        clientId,
        status,
        updatedAt: new Date()
      };

      const updatedUser = await User
        .findByIdAndUpdate(userId, updateData, { new: true })
        .select('-password');

      console.log('✅ ユーザー情報更新成功:', {
        userId,
        email: updatedUser.email
      });

      res.json({
        success: true,
        data: updatedUser
      });
    } catch (error) {
      console.error('❌ ユーザー更新エラー:', error);
      res.status(500).json({
        success: false,
        message: 'ユーザー情報の更新中にエラーが発生しました'
      });
    }
  };



// auth.controller.js内に追加

createUser = async (req, res) => {
  console.log('👤 新規ユーザー作成リクエスト受信');
  
  try {
    const { email, role, clientId } = req.body;

    // 基本バリデーション
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスは必須です'
      });
    }

    // 既存ユーザーチェック
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '既に登録されているメールアドレスです'
      });
    }

    // ユーザー作成
    const { user, temporaryPassword } = await authService.createUser(
      { email, role, clientId },
      req.user // 作成者情報
    );

    console.log('✅ ユーザー作成完了:', { 
      email: user.email,
      clientId: user.clientId 
    });

    res.json({
      success: true,
      message: 'ユーザーを作成しました',
      data: {
        user: user.toSafeObject(),
        temporaryPassword // 本番環境ではメール送信に使用
      }
    });
  } catch (error) {
    console.error('❌ ユーザー作成エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザーの作成中にエラーが発生しました'
    });
  }
};


  // ユーザー権限変更
  updateUserRole = async (req, res) => {
    try {
      const { role } = req.body;
      const userId = req.params.id;

      if (!['superadmin', 'admin', 'none'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: '無効な権限が指定されました'
        });
      }

      const updatedUser = await User
        .findByIdAndUpdate(
          userId,
          { role, updatedAt: new Date() },
          { new: true }
        )
        .select('-password');

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'ユーザーが見つかりません'
        });
      }

      console.log('✅ ユーザー権限更新成功:', {
        userId,
        role: updatedUser.role
      });

      res.json({
        success: true,
        data: updatedUser
      });
    } catch (error) {
      console.error('❌ 権限更新エラー:', error);
      res.status(500).json({
        success: false,
        message: 'ユーザー権限の更新中にエラーが発生しました'
      });
    }
  };
}







export const authController = new AuthController();