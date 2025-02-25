import { Router } from 'express';
import { authService } from './auth.service.js';
import { authMiddleware, superadminMiddleware, adminMiddleware } from './auth.middleware.js';
import { authController } from './auth.controller.js';  // 追加

const router = Router();

// ログイン
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスとパスワードを入力してください'
      });
    }

    const result = await authService.authenticateUser(email, password);
    res.json(result);
  } catch (error) {
    console.error('ログインエラー:', error);
    res.status(500).json({
      success: false,
      message: 'ログイン処理中にエラーが発生しました'
    });
  }
});
router.post('/users', [authMiddleware, adminMiddleware], authController.createUser);


// 現在のユーザー情報を取得
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('ユーザー情報取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー情報の取得中にエラーが発生しました'
    });
  }
});

// トークン検証（クライアント側での自動ログイン用）
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'トークンが提供されていません'
      });
    }

    const decoded = await authService.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: '無効なトークンです'
      });
    }

    const user = await authService.getUserById(decoded.userId);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('トークン検証エラー:', error);
    res.status(401).json({
      success: false,
      message: 'トークンの検証に失敗しました'
    });
  }
});

// ユーザー一覧取得（スーパー管理者専用）
router.get('/users', [authMiddleware, superadminMiddleware], async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      role,
      clientId  // 追加
    } = req.query;

    const result = await authService.getUsers({ 
      page, 
      limit, 
      search, 
      status, 
      role,
      clientId  // 追加
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('ユーザー一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー一覧の取得中にエラーが発生しました'
    });
  }
});

// クライアントID検証エンドポイント（新規追加）
router.post('/validate-client-id', [authMiddleware, adminMiddleware], async (req, res) => {
  try {
    const { clientId } = req.body;
    const isValid = await authService.validateClientId(clientId);
    
    res.json({
      success: true,
      data: {
        isValid,
        message: isValid ? 'クライアントIDは有効です' : '無効なクライアントIDです'
      }
    });
  } catch (error) {
    console.error('クライアントID検証エラー:', error);
    res.status(500).json({
      success: false,
      message: 'クライアントIDの検証中にエラーが発生しました'
    });
  }
});
// ユーザー詳細取得（スーパー管理者専用）
router.get('/users/:id', [authMiddleware, superadminMiddleware], async (req, res) => {
  try {
    const user = await authService.getUserById(req.params.id);
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
    console.error('ユーザー詳細取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー情報の取得中にエラーが発生しました'
    });
  }
});

// ユーザー情報更新（スーパー管理者専用）
router.put('/users/:id', [authMiddleware, superadminMiddleware], async (req, res) => {
  try {
    const updated = await authService.updateUser(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('ユーザー更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー情報の更新中にエラーが発生しました'
    });
  }
});

// ユーザー権限更新（スーパー管理者専用）
router.put('/users/:id/role', [authMiddleware, superadminMiddleware], async (req, res) => {
  try {
    const { role } = req.body;
    const updated = await authService.updateUserRole(req.params.id, role);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('権限更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザー権限の更新中にエラーが発生しました'
    });
  }
});

// ユーザーステータス更新（スーパー管理者専用）
router.put('/users/:id/status', [authMiddleware, superadminMiddleware], async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await authService.updateUser(req.params.id, { status });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('ステータス更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'ユーザーステータスの更新中にエラーが発生しました'
    });
  }
});

export default router;
