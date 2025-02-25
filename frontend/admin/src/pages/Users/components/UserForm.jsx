// UserForm.jsx
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
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const UserForm = ({ user = {}, open, onClose, onSubmit, isNew = false }) => {
  const [formData, setFormData] = useState({
    name: user.name || '',
    email: user.email || '',
    clientId: user.clientId || '',
    status: user.status || 'active',
    password: '', // 新規追加
    confirmPassword: '' // 新規追加
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const validateForm = () => {
    if (isNew) {
      if (!formData.password) {
        return 'パスワードは必須です';
      }
      if (formData.password !== formData.confirmPassword) {
        return 'パスワードが一致しません';
      }
    }
    if (!formData.email) {
      return 'メールアドレスは必須です';
    }
    if (!formData.name) {
      return '名前は必須です';
    }
    return null;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // バリデーション
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // パスワード確認用フィールドを除外
      const submitData = { ...formData };
      delete submitData.confirmPassword;

      const result = await onSubmit(submitData);
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isNew ? 'ユーザー新規作成' : 'ユーザー情報編集'}
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

            {isNew && (
              <>
                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel htmlFor="password">パスワード</InputLabel>
                    <OutlinedInput
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={handleChange('password')}
                      required
                      endAdornment={
                        <InputAdornment position="end">
                          <IconButton
                            onClick={handleClickShowPassword}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      }
                      label="パスワード"
                    />
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel htmlFor="confirm-password">パスワード（確認）</InputLabel>
                    <OutlinedInput
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      required
                      label="パスワード（確認）"
                    />
                  </FormControl>
                </Grid>
              </>
            )}

            {!isNew && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="クライアントID"
                  value={formData.clientId}
                  onChange={handleChange('clientId')}
                  required
                />
              </Grid>
            )}

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
            {loading ? (isNew ? '作成中...' : '更新中...') : (isNew ? '作成' : '更新')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default UserForm;