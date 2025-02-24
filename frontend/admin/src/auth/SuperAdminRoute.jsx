import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

const SuperAdminRoute = ({ children }) => {
  const { isAuthenticated, loading, isSuperAdmin } = useAuth();
  
  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin()) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default SuperAdminRoute;
