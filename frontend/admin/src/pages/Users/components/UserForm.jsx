import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Alert
} from '@mui/material';

const UserForm = ({ user, open, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    email: user.email,
    clientId: user.clientId,
    status: user.status
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await onSubmit(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onClose();
    } catch (error) {
      setError('更新中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          ユーザー情報編集
        </DialogTitle>

        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Grid item xs={12}>
                <Alert severity="error">{error}</Alert>
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="メールアドレス"
                value={formData.email}
                onChange={handleChange('email')}
                required
                type="email"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="クライアントID"
                value={formData.clientId}
                onChange={handleChange('clientId')}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label="ステータス"
                value={formData.status}
                onChange={handleChange('status')}
                required
              >
                <MenuItem value="active">有効</MenuItem>
                <MenuItem value="inactive">無効</MenuItem>
                <MenuItem value="withdrawn">退会済み</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={onClose}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
          >
            {loading ? '更新中...' : '更新'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default UserForm;
