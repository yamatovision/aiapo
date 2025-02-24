import { useState } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Stack,
  FormControlLabel,
  Checkbox,
  Divider
} from '@mui/material';

function ReservationForm({ onSubmit, onCancel }) {
  // フォームデータの初期状態を修正
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
    lineNotification: false
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // エラーをクリア
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name?.trim()) {
      newErrors.name = 'お名前を入力してください';
    }
    if (!formData.email?.trim()) {
      newErrors.email = 'メールアドレスを入力してください';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = '有効なメールアドレスを入力してください';
    }
    if (!formData.phone?.trim()) {
      newErrors.phone = '電話番号を入力してください';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);
      try {
        // ここでの予約データの構造を確認
        console.log('Submitting reservation data:', formData);
        await onSubmit(formData);
      } catch (error) {
        console.error('Form submission error:', error);
        setErrors({ submit: '予約の送信中にエラーが発生しました' });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setErrors(newErrors);
    }
  };
  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Typography variant="h6">
          予約情報の入力
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 120px)',
          overflow: 'auto',
          p: 2
        }}
      >
        <Stack spacing={2}>
          <TextField
            label="お名前"
            name="name"
            value={formData.name}
            onChange={handleChange}
            error={!!errors.name}
            helperText={errors.name}
            required
          />
          <TextField
            label="メールアドレス"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            error={!!errors.email}
            helperText={errors.email}
            required
          />
          <TextField
            label="電話番号"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            error={!!errors.phone}
            helperText={errors.phone}
            required
          />
          <TextField
            label="会社名"
            name="company"
            value={formData.company}
            onChange={handleChange}
          />
          <TextField
            label="作りたい仕組みやツール"
            name="message"
            value={formData.message}
            onChange={handleChange}
            multiline
            rows={4}
          />

          <Divider sx={{ my: 1 }} />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.lineNotification}
                onChange={handleCheckboxChange}
                name="lineNotification"
              />
            }
            label={
              <Box>
                <Typography variant="body2">
                  LINEでリマインド通知を受け取る
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  予約確認やリマインドをLINEでも受け取れます
                </Typography>
              </Box>
            }
          />
        </Stack>
      </Box>

      {errors.submit && (
        <Typography color="error" sx={{ px: 2 }}>
          {errors.submit}
        </Typography>
      )}

      <Box sx={{ 
        p: 2, 
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex', 
        gap: 2, 
        justifyContent: 'flex-end',
        backgroundColor: 'background.paper'
      }}>
        <Button 
          variant="outlined" 
          onClick={onCancel}
          disabled={isSubmitting}
        >
          キャンセル
        </Button>
        <Button 
          type="submit"
          variant="contained"
          disabled={isSubmitting}
          sx={{
            bgcolor: '#ff502b',
            '&:hover': {
              bgcolor: '#ff6b41'
            }
          }}
        >
          {isSubmitting ? '送信中...' : '予約を確定する'}
        </Button>
      </Box>
    </Box>
  );
}

export default ReservationForm;