// frontend/api.js
import axios from 'axios';  // axiosをインポート

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// APIリクエストの共通処理
const fetchAPI = async (endpoint, options = {}) => {
  try {
    // トークンの取得
    const token = localStorage.getItem('token');
    
    // paramsをURLSearchParamsに変換
    const queryParams = options.params && Object.keys(options.params).length > 0 ? 
      `?${new URLSearchParams(options.params).toString()}` : '';
    
    const url = `${API_BASE_URL}${endpoint}${queryParams}`;
    
    // paramsはURLに含めたので、optionsからは削除
    const { params, ...restOptions } = options;
    
    const response = await fetch(url, {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        // 認証トークンの追加
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...restOptions.headers,
      },
    });

    // 認証エラーの処理
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new APIError('認証が必要です', 401);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('5. Error Data:', errorData);
      throw new APIError(errorData.message || `HTTP error! status: ${response.status}`, response.status);
    }

    const data = await response.json();
    console.log('6. Response Data:', data);
    return data;
  } catch (error) {
    console.error('7. API Error:', error);
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(error.message, 500);
  }
};

// チャット関連のAPI


export const chatAPI = {
  streamMessage: async (message, history = [], onChunk) => {
    const response = await fetch(`${API_BASE_URL}/api/claude/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, history }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        }
      }
    }
  }
};

// frontend/api.js に追加する lineAPI
export const lineAPI = {
  // テンプレート管理
  getTemplates: () => 
    fetchAPI('/api/line/templates'),

  saveTemplate: (template) => {
    const url = template._id ? 
      `/api/line/templates/${template._id}` : 
      '/api/line/templates';
    return fetchAPI(url, {
      method: template._id ? 'PUT' : 'POST',
      body: JSON.stringify(template)
    });
  },

  deleteTemplate: (id) => 
    fetchAPI(`/api/line/templates/${id}`, {
      method: 'DELETE'
    }),

  toggleTemplate: (id, isActive) => 
    fetchAPI(`/api/line/templates/${id}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    }),


    getLineStatuses: async () => {
      try {
        const response = await fetchAPI('/api/line/statuses');
        console.log('LINE Statuses Raw Response:', response);
  
        if (!response) return {};
  
        // 予約IDをキーとしたオブジェクトを作成
        const statuses = {};
        Object.values(response).forEach(status => {
          if (status.reservationId) {
            statuses[status.reservationId] = {
              enabled: true,
              lastInteraction: status.lastInteraction,
              lineUserId: status.lineUserId
            };
          }
        });
  
        console.log('Processed LINE Statuses:', statuses);
        return statuses;
      } catch (error) {
        console.error('Failed to fetch LINE statuses:', error);
        return {};
      }
    },
  
  
    // 個別の予約のLINE連携状態取得
    getLineStatus: async (reservationId) => {
      try {
        const response = await fetchAPI(`/api/line/status/${reservationId}`);
        return response;
      } catch (error) {
        console.error('Failed to fetch LINE status:', error);
        throw error;
      }
    },
  

    
    // LINE通知設定の更新
    updateNotificationSettings: async (reservationId, settings) => {
      try {
        const response = await axios.patch(`/api/line/settings/${reservationId}`, settings);
        return response.data;
      } catch (error) {
        console.error('Failed to update LINE settings:', error);
        throw error;
      }
    },
  


  // LINE連携
  checkConnection: (reservationId) => 
    fetchAPI(`/api/line/check-connection/${reservationId}`),

  enableNotification: (reservationId, lineUserId) => 
    fetchAPI('/api/line/enable-notification', {
      method: 'POST',
      body: JSON.stringify({ reservationId, lineUserId })
    }),

  // テスト送信
  sendTestMessage: (lineUserId, message) => 
    fetchAPI('/api/line/test-message', {
      method: 'POST',
      body: JSON.stringify({ lineUserId, message })
    })
};



// 設定関連のAPI
export const settingsAPI = {
  // プロンプト設定を取得
  getSettings: () => 
    fetchAPI('/api/settings/prompts'),

  // 設定を更新
  updateSettings: (settings) => 
    fetchAPI('/api/settings/prompts', {
      method: 'POST',
      body: JSON.stringify(settings)
    }),
};



// カレンダー関連のAPI
export const calendarAPI = {
  // 利用可能な日時を取得
  getAvailableSlots: (startDate) => 
    fetchAPI('/api/calendar/slots', {
      method: 'GET',
      params: { date: startDate }  // startDateをdateとして送信
    }),

    saveGoogleToken: (tokenResponse) => 
      fetchAPI('/api/calendar/sync/save-token', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: tokenResponse.access_token,
          expiresIn: tokenResponse.expires_in
        })
      }),

      getAvailableCalendars: () => 
        fetchAPI('/api/calendar/sync/calendars', {
          method: 'GET'
        }),
  

  createReservation: (reservationData) => 
    fetchAPI('/api/calendar/reservations', {
      method: 'POST',
      body: JSON.stringify(reservationData)
    }),
    getSyncStatus: (clientId = 'default') => 
      fetchAPI('/api/calendar/sync/status', {
        params: { clientId }
      }),
      triggerSync: () => 
        fetchAPI('/api/calendar/sync/trigger', {
          method: 'POST'
        }),
    

      updateSyncCalendar: (calendarId) => 
        fetchAPI('/api/calendar/sync/calendar', {
          method: 'POST',
          body: JSON.stringify({ calendarId })
        }),
  
  // 新しく追加するメソッド
  getReservations: (params = '') => 
    fetchAPI(`/api/calendar/reservations${params ? `?${params}` : ''}`),


  getReservationsByDate: (date) => 
    fetchAPI(`/api/calendar/reservations/by-date?date=${date}`),


getReservationById: (id) => 
  fetchAPI(`/api/calendar/reservations/${id}`),

// 予約ステータスの更新
updateReservationStatus: (id, status) => 
  fetchAPI(`/api/calendar/reservations/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),

// 予約情報の更新
updateReservation: (id, data) => 
  fetchAPI(`/api/calendar/reservations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  getBusinessHours: (clientId) => 
    fetchAPI(`/api/calendar/business-hours${clientId ? `?clientId=${clientId}` : ''}`),

  // 営業時間設定の更新メソッドを修正
  updateBusinessHours: (clientId, data) => 
    fetchAPI(`/api/calendar/business-hours${clientId ? `?clientId=${clientId}` : ''}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  // 他の既存のメソッド
  getAvailableSlots: (startDate, endDate) => 
    fetchAPI('/api/calendar/slots', {
      method: 'GET',
      params: { startDate, endDate }
    }),

  createReservation: (reservationData) => 
    fetchAPI('/api/calendar/reservations', {
      method: 'POST',
      body: JSON.stringify(reservationData)
    }),


  // 予約枠の取得
  getTimeSlots: (startDate, endDate) => 
    fetchAPI(`/api/calendar/time-slots?start=${startDate}&end=${endDate}`),

  // 予約枠のブロック
  blockTimeSlot: (data) => 
    fetchAPI('/api/calendar/time-slots/block', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 予約枠のブロック解除
  unblockTimeSlot: (id) => 
    fetchAPI(`/api/calendar/time-slots/block/${id}`, {
      method: 'DELETE'
    }),

  // 例外設定の追加
  addException: (data) => 
    fetchAPI('/api/calendar/exceptions', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // 例外設定の削除
  removeException: (id) => 
    fetchAPI(`/api/calendar/exceptions/${id}`, {
      method: 'DELETE'
    }),
};
// frontend/api.js
export const emailAPI = {
  // メールテンプレート関連
  getTemplates: () => 
    fetchAPI('/api/email/templates'),

  saveTemplate: (template) => {
    const url = template._id ? `/api/email/templates/${template._id}` : '/api/email/templates';
    return fetchAPI(url, {
      method: template._id ? 'PUT' : 'POST',
      body: JSON.stringify(template)
    });
  },

  deleteTemplate: (id) => 
    fetchAPI(`/api/email/templates/${id}`, {
      method: 'DELETE'
    }),

  updateTemplateStatus: (id, template) => 
    fetchAPI(`/api/email/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(template)
    }),

  sendTestEmail: (templateId, testEmail) => 
    fetchAPI('/api/email/test', {
      method: 'POST',
      body: JSON.stringify({ templateId, testEmail })
    }),

  // メールログ関連
  getLogs: (params = '') => 
    fetchAPI(`/api/email/logs${params ? `?${params}` : ''}`),
};

// エラー型の定義
export class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

export const authAPI = {
  // ユーザー一覧取得
  getUsers: (params) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/api/auth/users${queryString ? `?${queryString}` : ''}`);
  },

  // ユーザー詳細取得
  getUserById: (id) => 
    fetchAPI(`/api/auth/users/${id}`),

  // ユーザー情報更新
  updateUser: (id, userData) => 
    fetchAPI(`/api/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    }),

  // ユーザー権限更新
  updateUserRole: (id, role) => 
    fetchAPI(`/api/auth/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    }),

  // ユーザーステータス更新
  updateUserStatus: (id, status) => 
    fetchAPI(`/api/auth/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    })
};

export default {
  chat: chatAPI,
  settings: settingsAPI,
  calendar: calendarAPI,
  line: lineAPI,
  email: emailAPI,
  auth: authAPI  // 追加
};