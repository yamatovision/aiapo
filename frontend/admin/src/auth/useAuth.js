import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from './AuthProvider';


export const useAuth = () => {
  const navigate = useNavigate();
  const { 
    user, 
    loading, 
    login, 
    logout, 
    checkAuth, 
    isAuthenticated 
  } = useAuthContext();

  // 初回マウント時に認証状態をチェック
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ログイン処理のラッパー
  const handleLogin = async (email, password) => {
    const result = await login(email, password);
    if (result.success) {
      navigate('/');  // ログイン成功時はダッシュボードへ
      return { success: true };
    }
    return result;  // エラーメッセージを含むレスポンスを返す
  };

  // ログアウト処理のラッパー
  const handleLogout = () => {
    logout();
    navigate('/login');  // ログアウト後はログインページへ
  };

  // 管理者権限チェック
  const isSuperAdmin = () => {
    return user?.role === 'superadmin';
  };

  // 少なくともadmin権限があるかチェック
  const isAdmin = () => {
    return ['superadmin', 'admin'].includes(user?.role);
  };

  return {
    user,
    loading,
    isAuthenticated,
    login: handleLogin,
    logout: handleLogout,
    isSuperAdmin,
    isAdmin
  };
};
