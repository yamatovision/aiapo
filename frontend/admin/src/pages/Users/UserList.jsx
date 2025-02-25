import { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAuth } from '../../auth/useAuth';
import { Navigate } from 'react-router-dom';
import UserTable from './components/UserTable';
import UserFilter from './components/UserFilter';
import UserForm from './components/UserForm';
import axios from 'axios';

const UserList = () => {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    role: ''
  });

  // スーパー管理者以外はアクセス不可
  if (!isSuperAdmin()) {
    return <Navigate to="/" />;
  }

  // ユーザー一覧の取得
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });

      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/auth/users?${params}`
      );

      if (response.data.success) {
        setUsers(response.data.data.users);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total
        }));
      }
    } catch (error) {
      console.error('ユーザー一覧取得エラー:', error);
      setError('ユーザー情報の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 新規ユーザー作成処理
  const handleCreateUser = async (userData) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/users`,
        userData
      );

      if (response.data.success) {
        fetchUsers(); // 一覧を再取得
        setShowNewUserForm(false);
        return { success: true };
      }
      return { 
        success: false, 
        message: response.data.message || '作成に失敗しました' 
      };
    } catch (error) {
      console.error('ユーザー作成エラー:', error);
      return {
        success: false,
        message: error.response?.data?.message || '作成中にエラーが発生しました'
      };
    }
  };

  // フィルター変更時の処理
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // ページネーション変更時の処理
  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, page }));
  };

  // ユーザー情報更新時の処理
  const handleUserUpdate = async (userId, updateData) => {
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/auth/users/${userId}`,
        updateData
      );

      if (response.data.success) {
        fetchUsers();
        return { success: true };
      }
      return { success: false, message: '更新に失敗しました' };
    } catch (error) {
      console.error('ユーザー更新エラー:', error);
      return {
        success: false,
        message: error.response?.data?.message || '更新中にエラーが発生しました'
      };
    }
  };

  // 権限変更時の処理
  const handleRoleChange = async (userId, role) => {
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/auth/users/${userId}/role`,
        { role }
      );

      if (response.data.success) {
        fetchUsers();
        return { success: true };
      }
      return { success: false, message: '権限の更新に失敗しました' };
    } catch (error) {
      console.error('権限更新エラー:', error);
      return {
        success: false,
        message: error.response?.data?.message || '更新中にエラーが発生しました'
      };
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, pagination.limit, filters]);

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          ユーザー管理
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setShowNewUserForm(true)}
        >
          新規作成
        </Button>
      </Box>

      <Paper sx={{ mb: 3, p: 2 }}>
        <UserFilter
          filters={filters}
          onFilterChange={handleFilterChange}
        />
      </Paper>

      <Paper>
        <UserTable
          users={users}
          loading={loading}
          error={error}
          pagination={{
            ...pagination,
            onPageChange: handlePageChange
          }}
          onUserUpdate={handleUserUpdate}
          onRoleChange={handleRoleChange}
        />
      </Paper>

      <UserForm
        open={showNewUserForm}
        onClose={() => setShowNewUserForm(false)}
        onSubmit={handleCreateUser}
        isNew={true}
      />
    </Box>
  );
};

export default UserList;