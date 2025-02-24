import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  IconButton,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Switch,
  FormControlLabel,
  Tooltip,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
  ContentCopy as CopyIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { lineAPI } from '../../../../api';

function LineSettings() {
  const [templates, setTemplates] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  // 時間設定用のstate
  const [timeSettings, setTimeSettings] = useState({
    value: 30,
    unit: 'minutes',
    direction: 'before'
  });

  const [formData, setFormData] = useState({
    name: '',
    type: 'custom',
    reminderMinutes: 30,
    displayName: '30分前',
    content: '',
    isActive: true
  });

  const timeUnits = {
    minutes: '分',
    hours: '時間',
    days: '日'
  };

  const variableDescriptions = {
    '{{name}}': '予約者名',
    '{{date}}': '予約日',
    '{{time}}': '予約時間',
    '{{zoom_url}}': 'ZoomミーティングURL（設定されている場合）'
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await lineAPI.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('テンプレート読み込みエラー:', error);
      showSnackbar('テンプレートの読み込みに失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 時間設定から分数を計算
  const calculateMinutes = (value, unit, direction) => {
    let minutes = value;
    switch (unit) {
      case 'hours':
        minutes *= 60;
        break;
      case 'days':
        minutes *= 24 * 60;
        break;
    }
    return direction === 'before' ? -minutes : minutes;  // ← ここだけ修正
  };

  // 分数から表示用の時間設定を計算
  const calculateTimeSettings = (minutes) => {
    const direction = minutes >= 0 ? 'after' : 'before';  // 修正: 正の値は「後」、負の値は「前」
    const absMinutes = Math.abs(minutes);
    
    if (absMinutes >= 24 * 60) {
      return {
        value: absMinutes / (24 * 60),
        unit: 'days',
        direction
      };
    } else if (absMinutes >= 60) {
      return {
        value: absMinutes / 60,
        unit: 'hours',
        direction
      };
    } else {
      return {
        value: absMinutes,
        unit: 'minutes',
        direction
      };
    }
  };

  const handleTimeSettingChange = (field, value) => {
    const newSettings = { ...timeSettings, [field]: value };
    setTimeSettings(newSettings);
    
    const minutes = calculateMinutes(
      newSettings.value,
      newSettings.unit,
      newSettings.direction
    );
  
    // displayName の生成ロジックも修正
    let displayName = `${newSettings.value}${timeUnits[newSettings.unit]}`;
    displayName += newSettings.direction === 'before' ? '前' : '後';  // この行は正しい
  
    setFormData(prev => ({
      ...prev,
      reminderMinutes: minutes,
      displayName: displayName  // 正しい displayName を設定
    }));
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    
    // 時間設定を計算
    const timeSettings = calculateTimeSettings(template.reminderMinutes);
    setTimeSettings(timeSettings);

    setFormData({
      name: template.name,
      type: template.type,
      reminderMinutes: template.reminderMinutes,
      displayName: template.displayName,
      content: template.content,
      isActive: template.isActive
    });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await lineAPI.saveTemplate({
        ...formData,
        _id: selectedTemplate?._id
      });
      
      showSnackbar('テンプレートを保存しました');
      setOpenDialog(false);
      loadTemplates();
    } catch (error) {
      console.error('保存エラー:', error);
      showSnackbar('テンプレートの保存に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('このテンプレートを削除してもよろしいですか？')) return;

    setLoading(true);
    try {
      await lineAPI.deleteTemplate(templateId);
      showSnackbar('テンプレートを削除しました');
      loadTemplates();
    } catch (error) {
      console.error('削除エラー:', error);
      showSnackbar('テンプレートの削除に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (template) => {
    setLoading(true);
    try {
      await lineAPI.toggleTemplate(template._id, !template.isActive);
      showSnackbar(`テンプレートを${!template.isActive ? '有効' : '無効'}にしました`);
      loadTemplates();
    } catch (error) {
      console.error('Toggle error:', error);
      showSnackbar('テンプレートの状態変更に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };
  const TimeSettingSection = () => {
    return (
      <Box sx={{ mt: 2 }}>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>送信タイミング</InputLabel>
          <Select
            value={formData.type}
            onChange={(e) => {
              const newType = e.target.value;
              setFormData(prev => ({
                ...prev,
                type: newType,
                displayName: newType === 'confirmation' ? '予約確認時' : prev.displayName
              }));
            }}
          >
            <MenuItem value="confirmation">予約確認(即時)</MenuItem>
            <MenuItem value="custom">指定時間</MenuItem>
          </Select>
        </FormControl>
  
        {/* カスタム時間設定は予約確認でない場合のみ表示 */}
        {formData.type === 'custom' && (
          <>
            <Typography variant="subtitle2">リマインド時間設定</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
              <TextField
                type="number"
                value={timeSettings.value}
                onChange={(e) => handleTimeSettingChange('value', parseInt(e.target.value, 10))}
                sx={{ width: 120 }}
                InputProps={{
                  inputProps: { min: 1 }
                }}
              />
              
              <FormControl sx={{ minWidth: 120 }}>
                <Select
                  value={timeSettings.unit}
                  onChange={(e) => handleTimeSettingChange('unit', e.target.value)}
                >
                  {Object.entries(timeUnits).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
  
              <FormControl sx={{ minWidth: 120 }}>
                <Select
                  value={timeSettings.direction}
                  onChange={(e) => handleTimeSettingChange('direction', e.target.value)}
                >
                  <MenuItem value="before">前</MenuItem>
                  <MenuItem value="after">後</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </>
        )}
  
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          設定: {formData.type === 'confirmation' ? '予約確認時' : formData.displayName}
        </Typography>
      </Box>
    );
  };


  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showSnackbar('クリップボードにコピーしました');
    } catch (error) {
      console.error('Copy error:', error);
      showSnackbar('コピーに失敗しました', 'error');
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const getQRCodeUrl = () => {
    const baseUrl = 'https://line.me/R/ti/p/';
    const botId = process.env.VITE_LINE_BOT_ID;
    return `${baseUrl}${botId}`;
  };


  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        LINE設定
      </Typography>

      {/* QRコードセクション */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            友だち追加用QRコード
          </Typography>
          <Button
            variant="outlined"
            startIcon={<QrCodeIcon />}
            onClick={() => setShowQR(!showQR)}
          >
            {showQR ? 'QRコードを隠す' : 'QRコードを表示'}
          </Button>
        </Box>
        
        {showQR && (
          <Box sx={{ textAlign: 'center', my: 2 }}>
            <QRCodeSVG 
              value={`https://line.me/R/ti/p/@${process.env.VITE_LINE_BOT_ID}`}
              size={200}
              level="H"
              includeMargin
            />
          </Box>
        )}
      </Paper>

      {/* テンプレート一覧 */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            メッセージテンプレート
          </Typography>
          <Button 
            variant="contained" 
            onClick={() => {
              setSelectedTemplate(null);
              setTimeSettings({ value: 30, unit: 'minutes', direction: 'before' });
              setFormData({
                name: '',
                type: 'custom',
                reminderMinutes: 30,
                displayName: '30分前',
                content: '',
                isActive: true
              });
              setOpenDialog(true);
            }}
            disabled={loading}
          >
            新規テンプレート
          </Button>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
            <CircularProgress />
          </Box>
        )}
<TableContainer>
  <Table>
    <TableHead>
      <TableRow>
        <TableCell>名前</TableCell>
        <TableCell>タイミング</TableCell>
        <TableCell>内容</TableCell>
        <TableCell>状態</TableCell>
        <TableCell>操作</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {templates.map((template) => (
        <TableRow key={template._id}>
          <TableCell>{template.name}</TableCell>
          <TableCell>
  {template.type === 'confirmation' 
    ? '予約確認' 
    : template.displayName}  
</TableCell>

          <TableCell>
            {template.content.substring(0, 50)}...
          </TableCell>
          <TableCell>
            <FormControlLabel
              control={
                <Switch
                  checked={template.isActive}
                  onChange={() => handleToggleActive(template)}
                  disabled={loading}
                />
              }
              label="有効"
            />
          </TableCell>
          <TableCell>
            <IconButton onClick={() => handleEdit(template)} disabled={loading}>
              <EditIcon />
            </IconButton>
            <IconButton onClick={() => handleDelete(template._id)} disabled={loading}>
              <DeleteIcon />
            </IconButton>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>
      </Paper>

      {/* テンプレート編集ダイアログ */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedTemplate ? 'テンプレートを編集' : '新規テンプレート'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="テンプレート名"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />

            {/* 時間設定コンポーネント */}
            <TimeSettingSection />

            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                利用可能な変数
                <Tooltip title="変数は送信時に実際の値に置き換えられます">
                  <IconButton size="small">
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Typography>
              {Object.entries(variableDescriptions).map(([variable, description]) => (
                <Tooltip key={variable} title={description}>
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ mr: 1, mb: 1 }}
                    onClick={() => {
                      const textArea = document.querySelector('[name="content"]');
                      if (textArea) {
                        const start = textArea.selectionStart;
                        const end = textArea.selectionEnd;
                        const newContent = 
                          formData.content.substring(0, start) +
                          variable +
                          formData.content.substring(end);
                        setFormData({ ...formData, content: newContent });
                      }
                    }}
                  >
                    {variable}
                  </Button>
                </Tooltip>
              ))}
            </Box>

            <TextField
              label="メッセージ内容"
              multiline
              rows={10}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              fullWidth
              required
              name="content"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              }
              label="テンプレートを有効にする"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={loading}>
            キャンセル
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained"
            disabled={loading || !formData.name || !formData.content}
          >
            {loading ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default LineSettings;