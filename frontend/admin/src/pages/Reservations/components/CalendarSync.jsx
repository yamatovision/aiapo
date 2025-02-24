import { useState, useEffect } from 'react';
import { calendarAPI } from '../../../../../api';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Collapse
} from '@mui/material';
import {
  Google as GoogleIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';

const CalendarSync = () => {
  const [syncStatus, setSyncStatus] = useState({
    isConnected: false,
    loading: true,
    error: null,
    lastSync: null,
    selectedCalendar: null,
    availableCalendars: []
  });
  const [openSection, setOpenSection] = useState({
    details: true,
    calendars: false,
    logs: false
  });

  const CLIENT_ID = '235426778039-35a3sk7potfffbqgrqej15utuf16b8em.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  // ハンドラー関数を先に定義
  const handleRefreshSync = async () => {
    try {
      setSyncStatus(prev => ({ ...prev, loading: true }));
      await fetchSyncStatus();
    } catch (error) {
      console.error('Failed to refresh sync status:', error);
      setSyncStatus(prev => ({
        ...prev,
        loading: false,
        error: '同期状態の更新に失敗しました'
      }));
    }
  };
  const fetchSyncStatus = async () => {
    try {
      const data = await calendarAPI.getSyncStatus('default');
      console.log('Sync status response:', data);
  
      // カレンダー一覧を取得
      if (data.syncStatus === 'active') {
        const calendarsData = await calendarAPI.getAvailableCalendars();
        console.log('Available calendars:', calendarsData);
  
        setSyncStatus(prev => ({
          ...prev,
          isConnected: true,
          selectedCalendar: {
            id: data.calendarId,
            name: data.calendarName
          },
          availableCalendars: calendarsData || [],
          lastSync: data.lastSyncTime,
          loading: false,
          error: null
        }));
      } else {
        setSyncStatus(prev => ({
          ...prev,
          isConnected: false,
          selectedCalendar: null,
          availableCalendars: [],
          loading: false,
          error: null
        }));
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
      setSyncStatus(prev => ({
        ...prev,
        loading: false,
        error: '同期状態の取得に失敗しました'
      }));
    }
  };

  const handleConnect = async () => {
    console.log('🔄 Starting connection process');
    try {
      setSyncStatus(prev => ({ ...prev, loading: true }));
      
      if (window.tokenClient) {
        console.log('🔑 Requesting access token...');
        window.tokenClient.requestAccessToken();
      } else {
        throw new Error('Token client not initialized');
      }
    } catch (error) {
      console.error('❌ Connection error:', error);
      setSyncStatus(prev => ({
        ...prev,
        loading: false,
        error: `接続エラー: ${error.message || '不明なエラー'}`
      }));
    }
  };

  const handleDisconnect = async () => {
    console.log('🔄 Starting disconnection process');
    try {
      google.accounts.oauth2.revoke(
        google.accounts.oauth2.getToken()?.access_token,
        async () => {
          console.log('✅ Successfully disconnected');
          await calendarAPI.disconnectSync();
          setSyncStatus(prev => ({
            ...prev,
            isConnected: false,
            selectedCalendar: null,
            availableCalendars: [],
            loading: false,
            error: null
          }));
        }
      );
    } catch (error) {
      console.error('❌ Disconnection error:', error);
      setSyncStatus(prev => ({
        ...prev,
        loading: false,
        error: `接続解除エラー: ${error.message || '不明なエラー'}`
      }));
    }
  };

  const handleCalendarSelect = async (calendarId) => {
    try {
      setSyncStatus(prev => ({ ...prev, loading: true }));
      await calendarAPI.updateSyncCalendar(calendarId);
      await fetchSyncStatus();
    } catch (error) {
      console.error('Failed to update calendar:', error);
      setSyncStatus(prev => ({
        ...prev,
        loading: false,
        error: 'カレンダーの更新に失敗しました'
      }));
    }
  };

  const toggleSection = (section) => {
    setOpenSection(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    console.log('🚀 CalendarSync component mounted');
    
    const loadGoogleIdentity = async () => {
      console.log('📡 Starting to load Google Identity Services');
      
      try {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        console.log('📚 Google Identity Services script loaded');

        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async (response) => {
            if (response.error !== undefined) {
              console.error('❌ Token error:', response);
              setSyncStatus(prev => ({
                ...prev,
                isConnected: false,
                loading: false,
                error: `認証エラー: ${response.error}`
              }));
            } else {
              console.log('✅ Token received successfully');
              try {
                await calendarAPI.saveGoogleToken(response);
                await fetchSyncStatus();
              } catch (error) {
                console.error('Failed to save token:', error);
                setSyncStatus(prev => ({
                  ...prev,
                  loading: false,
                  error: 'トークンの保存に失敗しました'
                }));
              }
            }
          },
        });

        window.tokenClient = tokenClient;
        
        console.log('⚙️ Token client initialized');
        await fetchSyncStatus();

      } catch (error) {
        console.error('❌ Error initializing Google Identity Services:', error);
        setSyncStatus(prev => ({
          ...prev,
          loading: false,
          error: `初期化エラー: ${error.message || '不明なエラー'}`
        }));
      }
    };

    loadGoogleIdentity();
    
    return () => {
      console.log('🧹 Cleaning up CalendarSync component');
    };
  }, []);

  if (syncStatus.loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Googleカレンダー連携
      </Typography>
      
      {syncStatus.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {syncStatus.error}
        </Alert>
      )}

      <List>
        <ListItem>
          <ListItemText
            primary="接続状態"
            secondary={
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" component="div" gutterBottom>
                  ステータス: {syncStatus.isConnected ? '接続済み' : '未接続'}
                </Typography>
                {syncStatus.lastSync && (
                  <Typography variant="body2" component="div">
                    最終同期: {new Date(syncStatus.lastSync).toLocaleString()}
                  </Typography>
                )}
              </Box>
            }
          />
          {syncStatus.isConnected ? (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisconnect}
              disabled={syncStatus.loading}
            >
              接続を解除
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<GoogleIcon />}
              onClick={handleConnect}
              disabled={syncStatus.loading}
            >
              Googleカレンダーと連携
            </Button>
          )}
        </ListItem>

        {syncStatus.isConnected && (
          <>
            <ListItem
              button
              onClick={() => toggleSection('calendars')}
            >
              <ListItemText primary="カレンダー設定" />
              {openSection.calendars ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItem>
            <Collapse in={openSection.calendars}>
              <Box sx={{ pl: 2, pr: 2, pb: 2 }}>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel>同期するカレンダー</InputLabel>
                  <Select
                    value={syncStatus.selectedCalendar?.id || ''}
                    onChange={(e) => handleCalendarSelect(e.target.value)}
                    label="同期するカレンダー"
                  >
                    {syncStatus.availableCalendars.map(cal => (
                      <MenuItem key={cal.id} value={cal.id}>
                        {cal.summary} {cal.primary ? '(主要カレンダー)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Collapse>

            <ListItem>
              <Button
                startIcon={<RefreshIcon />}
                onClick={handleRefreshSync}
                disabled={syncStatus.loading}
              >
                同期状態を更新
              </Button>
            </ListItem>
          </>
        )}
      </List>
    </Paper>
  );
};

export default CalendarSync;
