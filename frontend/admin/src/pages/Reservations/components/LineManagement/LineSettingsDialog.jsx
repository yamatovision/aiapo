import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Switch,
  Typography,
  Alert
} from '@mui/material';

const LineSettingsDialog = ({ open, onClose, lineInfo, onUpdate }) => {
  const [settings, setSettings] = useState({
    reminder24h: lineInfo?.notificationSettings?.reminder24h ?? true,
    reminder1h: lineInfo?.notificationSettings?.reminder1h ?? true,
    followupEnabled: lineInfo?.notificationSettings?.followupEnabled ?? true
  });
  const [error, setError] = useState(null);

  const handleChange = (event) => {
    setSettings({
      ...settings,
      [event.target.name]: event.target.checked
    });
  };

  const handleSave = async () => {
    try {
      await onUpdate(settings);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>LINE通知設定</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          通知タイミングの設定
        </Typography>
        
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={settings.reminder24h}
                onChange={handleChange}
                name="reminder24h"
              />
            }
            label="24時間前にリマインド"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.reminder1h}
                onChange={handleChange}
                name="reminder1h"
              />
            }
            label="1時間前にリマインド"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.followupEnabled}
                onChange={handleChange}
                name="followupEnabled"
              />
            }
            label="フォローアップメッセージを送信"
          />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSave} variant="contained">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LineSettingsDialog;