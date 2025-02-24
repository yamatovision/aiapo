import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert
} from '@mui/material';

const TestMessageDialog = ({ open, onClose, onSend }) => {
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      setError('メッセージを入力してください');
      return;
    }

    try {
      setSending(true);
      await onSend(message);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>テストメッセージ送信</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <TextField
          fullWidth
          multiline
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="送信するメッセージを入力してください"
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          キャンセル
        </Button>
        <Button 
          onClick={handleSend}
          variant="contained"
          disabled={sending}
        >
          送信
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TestMessageDialog;