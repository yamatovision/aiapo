import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ログイン処理
  const login = useCallback(async (email, password) => {
    console.log('🔑 ログイン処理を開始します');
    console.log('📡 API URL:', import.meta.env.VITE_API_URL); // APIのURLを確認
  
    try {
      const apiUrl = `${import.meta.env.VITE_API_URL}/api/auth/login`;
      console.log('🎯 リクエスト送信先:', apiUrl);
  
      const response = await axios.post(apiUrl, {
        email,
        password
      });
  
      console.log('📥 サーバーレスポンス:', response.data);
  
      if (response.data.success) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(user);
        console.log('✅ ログイン成功:', user.email);
        return { success: true };
      } else {
        console.log('❌ ログイン失敗:', response.data.message);
        return { 
          success: false, 
          message: response.data.message || 'ログインに失敗しました'
        };
      }
    } catch (error) {
      console.error('❌ ログインエラー詳細:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      return { 
        success: false, 
        message: error.response?.data?.message || 'ログイン中にエラーが発生しました'
      };
    }
  }, []);
  // ログアウト処理
  const logout = useCallback(() => {
    console.log('🚪 ログアウトを実行します');
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    console.log('✅ ログアウト完了');
  }, []);

  // トークンの検証と自動ログイン
  const checkAuth = useCallback(async () => {
    console.log('🔍 認証状態を確認中...');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('ℹ️ トークンが存在しません');
        setLoading(false);
        return;
      }

      console.log('🔄 トークンを検証中...');
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/verify-token`, { token });

      if (response.data.success) {
        console.log('✅ トークン検証成功:', response.data.user.email);
        setUser(response.data.user);
      } else {
        console.log('❌ トークンが無効です');
        logout();
      }
    } catch (error) {
      console.error('❌ トークン検証エラー:', error);
      logout();
    } finally {
      setLoading(false);
      console.log('🏁 認証チェック完了');
    }
  }, [logout]);

  // ユーザー情報の更新
  const updateUser = useCallback((userData) => {
    console.log('👤 ユーザー情報を更新:', userData);
    setUser(userData);
  }, []);

  // 初期化時の認証チェック
  useEffect(() => {
    console.log('🚀 AuthProvider を初期化中...');
    checkAuth();
  }, [checkAuth]);

  const value = {
    user,
    loading,
    login,
    logout,
    checkAuth,
    updateUser,
    isAuthenticated: !!user,
  };

  // 認証状態をログ出力
  useEffect(() => {
    console.log('認証状態:', {
      isAuthenticated: !!user,
      loading,
      userEmail: user?.email
    });
  }, [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// カスタムフック
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext は AuthProvider 内で使用する必要があります');
  }
  return context;
};