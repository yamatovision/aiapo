import { useState } from 'react';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  AppBar,
  Toolbar,
  Typography,
  Divider,
  Collapse,
  ListItemButton
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Code as CodeIcon,
  EventNote as EventIcon,
  Email as EmailIcon,
  Chat as ChatIcon,
  People as PeopleIcon,
  ExpandLess,
  ExpandMore
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const drawerWidth = 240;

function Navigation() {
  const [openSubMenu, setOpenSubMenu] = useState({});
  const { isSuperAdmin } = useAuth();

  const menuItems = [
    { 
      text: 'ダッシュボード', 
      icon: <DashboardIcon />, 
      path: '/' 
    },
    { 
      text: '予約管理', 
      icon: <EventIcon />, 
      path: '/reservations' 
    },
    { 
      text: 'メール管理', 
      icon: <EmailIcon />, 
      subItems: [
        { text: 'テンプレート', path: '/email/templates' },
        { text: '送信ログ', path: '/email/logs' }
      ]
    },
    { 
      divider: true 
    },
    // スーパー管理者専用メニュー
    {
      text: 'ユーザー管理',
      icon: <PeopleIcon />,
      path: '/users',
      requireSuperAdmin: true
    },
    { 
      text: 'LINE設定', 
      icon: <ChatIcon />, 
      path: '/settings/line' 
    },
    { 
      text: 'プロンプト設定', 
      icon: <SettingsIcon />, 
      path: '/settings/prompts' 
    },
    { 
      text: '導入設定', 
      icon: <CodeIcon />, 
      path: '/integration' 
    }
  ];

  const handleSubMenuClick = (text) => {
    setOpenSubMenu(prev => ({
      ...prev,
      [text]: !prev[text]
    }));
  };

  // 権限チェックを含むメニュー表示判定
  const shouldShowMenuItem = (item) => {
    if (item.requireSuperAdmin && !isSuperAdmin()) {
      return false;
    }
    return true;
  };

  return (
    <>
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: 'primary.main'
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            AIアポ 管理画面
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            mt: 8
          },
        }}
      >
        <List>
          {menuItems.map((item, index) => {
            // 権限チェック
            if (!shouldShowMenuItem(item)) {
              return null;
            }

            if (item.divider) {
              return <Divider key={`divider-${index}`} />;
            }

            if (item.subItems) {
              return (
                <div key={item.text}>
                  <ListItemButton onClick={() => handleSubMenuClick(item.text)}>
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} />
                    {openSubMenu[item.text] ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton><Collapse in={openSubMenu[item.text]} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {item.subItems.map((subItem) => (
                        <ListItemButton
                          key={subItem.text}
                          component={RouterLink}
                          to={subItem.path}
                          sx={{ pl: 4 }}
                        >
                          <ListItemText primary={subItem.text} />
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                </div>
              );
            }

            return (
              <ListItem
                button
                key={item.text}
                component={RouterLink}
                to={item.path}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            );
          })}
        </List>
      </Drawer>
    </>
  );
}

export default Navigation;
