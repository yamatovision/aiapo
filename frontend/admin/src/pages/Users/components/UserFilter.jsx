import { useState } from 'react';
import {
  Box,
  TextField,
  MenuItem,
  Button,
  Grid
} from '@mui/material';

const UserFilter = ({ filters, onFilterChange }) => {
  const [localFilters, setLocalFilters] = useState(filters);

  const handleChange = (field) => (event) => {
    const newFilters = {
      ...localFilters,
      [field]: event.target.value
    };
    setLocalFilters(newFilters);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onFilterChange(localFilters);
  };

  const handleReset = () => {
    const resetFilters = {
      search: '',
      status: '',
      role: ''
    };
    setLocalFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="検索"
            placeholder="メールアドレスで検索"
            value={localFilters.search}
            onChange={handleChange('search')}
          />
        </Grid>
        
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            select
            label="ステータス"
            value={localFilters.status}
            onChange={handleChange('status')}
          >
            <MenuItem value="">すべて</MenuItem>
            <MenuItem value="active">有効</MenuItem>
            <MenuItem value="inactive">無効</MenuItem>
            <MenuItem value="withdrawn">退会済み</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            select
            label="権限"
            value={localFilters.role}
            onChange={handleChange('role')}
          >
            <MenuItem value="">すべて</MenuItem>
            <MenuItem value="superadmin">スーパー管理者</MenuItem>
            <MenuItem value="admin">管理者</MenuItem>
            <MenuItem value="none">権限なし</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} sm={2}>
          <Box display="flex" gap={1}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
            >
              検索
            </Button>
            <Button
              type="button"
              variant="outlined"
              onClick={handleReset}
              fullWidth
            >
              リセット
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default UserFilter;
