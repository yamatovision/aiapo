// UserForm.jsx の修正
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
  Alert,
  Typography
} from '@mui/material';

const UserForm = ({ user = {}, open, onClose, onSubmit, isNew = false }) => {
  const [formData, setFormData] = useState({
    name: user.name || '',     // 追加
    email: user.email || '',
    clientId: user.clientId || '',
    status: user.status || 'active',
    role: user.role || 'admin'
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
      setError(isNew ? '作成中にエラーが発生しました' : '更新中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <form onSubmit={handleSubmit}>
      <DialogTitle>
        {isNew ? 'ユーザー新規作成' : 'ユーザー情報編集'}
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {/* 名前フィールドを追加 */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="名前"
              value={formData.name}
              onChange={handleChange('name')}
              required
            />
          </Grid>

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
            {!isNew && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="クライアントID"
                  value={formData.clientId}
                  onChange={handleChange('clientId')}
                  required
                  helperText="CLで始まる一意の識別子"
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label="権限"
                value={formData.role}
                onChange={handleChange('role')}
                required
              >
                <MenuItem value="admin">管理者</MenuItem>
                <MenuItem value="superadmin">スーパー管理者</MenuItem>
              </TextField>
            </Grid>

            {!isNew && (
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
            )}
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
            {loading ? (isNew ? '作成中...' : '更新中...') : (isNew ? '作成' : '更新')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default UserForm;