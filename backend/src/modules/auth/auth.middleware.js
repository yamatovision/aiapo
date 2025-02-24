import jwt from 'jsonwebtoken';
import User from './auth.model.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: '認証が必要です' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'ユーザーが見つかりません' 
      });
    }

    if (!user.canLogin()) {
      return res.status(403).json({ 
        success: false,
        message: 'アクセスが制限されています' 
      });
    }

    // リクエストにユーザー情報とclientIdを付与
    req.user = user;
    req.clientId = user.clientId;

    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(401).json({ 
      success: false,
      message: '認証に失敗しました' 
    });
  }
};

// superadmin専用ルート用のミドルウェア
export const superadminMiddleware = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ 
      success: false,
      message: 'この操作には管理者権限が必要です' 
    });
  }
  next();
};

// admin以上の権限が必要なルート用のミドルウェア
export const adminMiddleware = (req, res, next) => {
  if (!['superadmin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ 
      success: false,
      message: 'この操作には権限が必要です' 
    });
  }
  next();
};
