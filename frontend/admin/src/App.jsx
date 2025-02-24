import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ja } from 'date-fns/locale';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Navigation from './components/Navigation';
import PromptSettings from './pages/Settings/PromptSettings';
import LineSettings from './pages/Settings/LineSettings';
import ScriptGenerator from './pages/Integration/ScriptGenerator';
import ReservationList from './pages/Reservations/ReservationList';
import ReservationDetail from './pages/Reservations/ReservationDetail';
import EmailTemplates from './pages/Email/EmailTemplates';
import EmailLogs from './pages/Email/EmailLogs';
import UserList from './pages/Users/UserList';
import LoginPage from './pages/Auth/LoginPage';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import SuperAdminRoute from './auth/SuperAdminRoute';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2196F3',
      light: '#FF80AB',
      dark: '#F50057'
    },
    secondary: {
      main: '#2196F3',
      light: '#64B5F6',
      dark: '#1976D2'
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff'
    }
  },
  typography: {
    h6: {
      fontWeight: 600
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    }
  },
});

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja}>
        <CssBaseline />
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Box><LoginPage /></Box>} />
              
              {/* ユーザー管理画面（スーパー管理者専用） */}
              <Route
                path="/users"
                element={
                  <SuperAdminRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <UserList />
                      </Box>
                    </Box>
                  </SuperAdminRoute>
                }
              />

              {/* 既存のルート */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <div>ダッシュボード（準備中）</div>
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/reservations"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <ReservationList />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/reservations/:id"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <ReservationDetail />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/email/templates"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <EmailTemplates />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/email/logs"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <EmailLogs />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/settings/line"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <LineSettings />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/settings/prompts"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <PromptSettings />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
              
              <Route
                path="/integration"
                element={
                  <PrivateRoute>
                    <Box sx={{ display: 'flex' }}>
                      <Navigation />
                      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
                        <ScriptGenerator />
                      </Box>
                    </Box>
                  </PrivateRoute>
                }
              />
            </Routes>
          </Router>
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
