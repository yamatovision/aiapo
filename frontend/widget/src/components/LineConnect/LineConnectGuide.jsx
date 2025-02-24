// LineConnectGuide.jsx

import { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import { lineAPI } from '../../api';

function LineConnectGuide({ reservationId, onComplete }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('pending');
  const [popup, setPopup] = useState(null);

  // 接続状態の確認
  const checkConnectionStatus = async () => {
    try {
      const result = await lineAPI.checkAuthStatus(reservationId);
      if (result.connected) {
        setConnectionStatus('connected');
        onComplete?.();
      }
    } catch (err) {
      console.error('Connection check error:', err);
    }
  };

  // ポップアップウィンドウの監視
  useEffect(() => {
    if (popup) {
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          checkConnectionStatus();
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [popup]);

  // LINE連携処理の開始
  const handleLineConnect = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // LINE Login URLの取得
      const { url } = await lineAPI.getLoginUrl(reservationId);

      // ポップアップウィンドウでLINE Login画面を開く
      const loginPopup = window.open(
        url,
        'LINE Login',
        'width=600,height=700,location=yes,resizable=yes,scrollbars=yes'
      );

      setPopup(loginPopup);

    } catch (err) {
      console.error('LINE connection error:', err);
      setError('LINE連携の開始に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 3, 
        textAlign: 'center',
        maxWidth: 400,
        mx: 'auto'
      }}
    >
      <Typography variant="h6" sx={{ mb: 2 }}>
        LINE通知の設定
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        LINEで予約確認やリマインド通知を受け取ることができます。
        以下のボタンからLINEとの連携を行ってください。
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="success"
          onClick={handleLineConnect}
          disabled={isLoading || connectionStatus === 'connected'}
          fullWidth
          sx={{ mb: 2 }}
        >
          {isLoading ? (
            <CircularProgress size={24} color="inherit" />
          ) : connectionStatus === 'connected' ? (
            'LINE連携完了'
          ) : (
            'LINEで連携する'
          )}
        </Button>
      </Box>

      <Typography 
        variant="caption" 
        color="text.secondary"
        component="div"
        sx={{ mt: 2 }}
      >
        ※ あとからでも設定可能です
      </Typography>

      {connectionStatus === 'connected' && (
        <Alert severity="success" sx={{ mt: 2 }}>
          LINE連携が完了しました
        </Alert>
      )}
    </Paper>
  );
}

export default LineConnectGuide;