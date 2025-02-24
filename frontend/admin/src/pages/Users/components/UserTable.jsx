import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  IconButton,
  MenuItem,
  Select,
  Chip,
  CircularProgress,
  Alert,
  Box
} from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { useState } from 'react';
import UserForm from "./UserForm";  // 同じcomponentsディレクトリ内にあるため


const StatusChip = ({ status }) => {
  const statusProps = {
    active: { color: 'success', label: '有効' },
    inactive: { color: 'warning', label: '無効' },
    withdrawn: { color: 'error', label: '退会済み' }
  };

  const { color, label } = statusProps[status] || { color: 'default', label: '不明' };

  return <Chip size="small" color={color} label={label} />;
};

const RoleChip = ({ role }) => {
  const roleProps = {
    superadmin: { color: 'error', label: 'スーパー管理者' },
    admin: { color: 'primary', label: '管理者' },
    none: { color: 'default', label: '権限なし' }
  };

  const { color, label } = roleProps[role] || { color: 'default', label: '不明' };

  return <Chip size="small" color={color} label={label} />;
};

const UserTable = ({
  users,
  loading,
  error,
  pagination,
  onUserUpdate,
  onRoleChange
}) => {
  const [editingUser, setEditingUser] = useState(null);

  const handleRoleChange = async (userId, newRole) => {
    await onRoleChange(userId, newRole);
  };

  const handleClose = () => {
    setEditingUser(null);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>メールアドレス</TableCell>
              <TableCell>クライアントID</TableCell>
              <TableCell>ステータス</TableCell>
              <TableCell>権限</TableCell>
              <TableCell>最終ログイン</TableCell>
              <TableCell>登録日</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.clientId}</TableCell>
                <TableCell>
                  <StatusChip status={user.status} />
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={user.role}
                    onChange={(e) => handleRoleChange(user._id, e.target.value)}
                    disabled={user.status === 'withdrawn'}
                  >
                    <MenuItem value="superadmin">
                      <RoleChip role="superadmin" />
                    </MenuItem>
                    <MenuItem value="admin">
                      <RoleChip role="admin" />
                    </MenuItem>
                    <MenuItem value="none">
                      <RoleChip role="none" />
                    </MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '-'}
                </TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() => setEditingUser(user)}
                    disabled={user.status === 'withdrawn'}
                  >
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page - 1}
          onPageChange={(_, newPage) => pagination.onPageChange(newPage + 1)}
          rowsPerPage={pagination.limit}
          rowsPerPageOptions={[10]}
        />
      </TableContainer>

      {editingUser && (
        <UserForm
          user={editingUser}
          open={!!editingUser}
          onClose={handleClose}
          onSubmit={async (data) => {
            const result = await onUserUpdate(editingUser._id, data);
            if (result.success) {
              handleClose();
            }
            return result;
          }}
        />
      )}
    </>
  );
};

export default UserTable;
