import calendarService from './calendar.service.js';
import { BusinessHours } from './calendar.model.js';  // インポート追加
import lineService from '../line/line.service.js';  // 追加

export const calendarController = {
  // 既存の予約管理機能
  async getReservationById(req, res) {
    try {
      const { id } = req.params;
      const reservation = await calendarService.getReservationById(id);
      res.json(reservation);
    } catch (error) {
      console.error('Error in getReservationById controller:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Reservation not found'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },




  async getReservations(req, res) {
    try {
      const { startDate, endDate, status } = req.query;
      const filters = {};

      if (startDate || endDate) {
        filters.datetime = {};
        if (startDate) filters.datetime.$gte = new Date(startDate);
        if (endDate) filters.datetime.$lte = new Date(endDate);
      }

      if (status) {
        filters.status = status;
      }

      const reservations = await calendarService.getReservations(filters);
      res.json(reservations);
    } catch (error) {
      console.error('Error in getReservations controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async getReservationsByDate(req, res) {
    try {
      const { date } = req.query;
      if (!date) {
        return res.status(400).json({
          error: 'Date parameter is required'
        });
      }
  
      const reservations = await calendarService.getReservationsByDate(date);
      res.json(reservations);
    } catch (error) {
      console.error('Error in getReservationsByDate controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },


  async getAvailableSlots(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
  
      // BusinessHoursモデルから営業時間を取得
      let businessHours = await BusinessHours.findOne({ clientId: 'default' });
      if (!businessHours) {
        businessHours = await this.getBusinessHours('default');
      }
  
      // 曜日の取得（'monday', 'tuesday'等の形式で）
      const dayOfWeek = startOfDay.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const dayConfig = businessHours.businessHours[dayOfWeek];
  
      // その日が営業日でない場合は空配列を返す
      if (!dayConfig.isOpen) {
        return [];
      }
  
      // 予約済み時間を取得
      const reservations = await Reservation.find({
        datetime: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        status: { $in: ['confirmed', 'pending'] }
      });
  
      // 予約済み時間のセット作成
      const bookedTimes = new Set(
        reservations.map(r => r.datetime.getHours())
      );
  
      // 営業時間内の利用可能な時間枠を生成
      const [startHour] = dayConfig.start.split(':').map(Number);
      const [endHour] = dayConfig.end.split(':').map(Number);
      const availableSlots = [];
  
      for (let hour = startHour; hour < endHour; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        const isBooked = bookedTimes.has(hour);
  
        if (!isBooked) {
          availableSlots.push({
            time: timeString,
            available: true
          });
        }
      }
  
      return availableSlots;
    } catch (error) {
      console.error('Error in getAvailableSlots:', error);
      throw error;
    }
  },




  async createReservation(req, res) {
    try {
      const reservationData = req.body;
      console.log('Received reservation data:', reservationData);
  
      // より詳細なバリデーション
      const validationErrors = [];
      
      if (!reservationData.clientId) {
        validationErrors.push('clientId is required');
      }
      
      if (!reservationData.datetime) {
        validationErrors.push('datetime is required');
      }
      
      if (!reservationData.customerInfo) {
        validationErrors.push('customerInfo is required');
      } else {
        if (!reservationData.customerInfo.name) {
          validationErrors.push('customer name is required');
        }
        if (!reservationData.customerInfo.email) {
          validationErrors.push('customer email is required');
        }
        if (!reservationData.customerInfo.phone) {
          validationErrors.push('customer phone is required');
        }
      }
  
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Required fields are missing',
          details: validationErrors
        });
      }
  
      // 予約データの整形
      const formattedReservationData = {
        clientId: reservationData.clientId,
        datetime: new Date(reservationData.datetime),
        status: 'confirmed',  // 常にconfirmedで作成
        customerInfo: {
          name: reservationData.customerInfo.name,
          email: reservationData.customerInfo.email,
          phone: reservationData.customerInfo.phone,
          company: reservationData.customerInfo.company || '',
          message: reservationData.customerInfo.message || ''
        },
        lineNotification: {
          enabled: reservationData.lineNotification?.enabled || false
        }
      };
      console.log('Formatted reservation data:', formattedReservationData);
  
      const reservation = await calendarService.createReservation(formattedReservationData);
      console.log('Created reservation:', reservation);
  
      // LINE連携の自動チェックを追加
      try {
        console.log('Checking LINE connection for:', reservation.customerInfo.email);
        await lineService.handleNewReservation(reservation);
        console.log('LINE connection check completed');
      } catch (lineError) {
        console.error('LINE connection check error:', lineError);
      }
  
      res.status(201).json(reservation);
    } catch (error) {
      console.error('Error in createReservation controller:', error);
      
      if (error.message.includes('already booked')) {
        return res.status(409).json({
          error: 'This time slot is already booked'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  // calendar.controller.jsに追加
  async getSyncStatus(req, res) {
    try {
      const clientId = req.query.clientId || 'default';
      const syncData = await CalendarSync.findOne({ clientId });
  
      if (!syncData) {
        return res.json({
          syncStatus: 'disconnected',
          message: 'No sync configuration found'
        });
      }
  
      return res.json({
        syncStatus: syncData.syncStatus,
        calendarId: syncData.calendarId,
        calendarName: syncData.calendarName,
        lastSyncTime: syncData.lastSyncTime,
        availableCalendars: syncData.availableCalendars || []
      });
  
    } catch (error) {
      console.error('Error in getSyncStatus:', error);
      res.status(500).json({
        error: 'Failed to get sync status',
        details: error.message
      });
    }
  },

  async getAvailableCalendars(req, res) {
    try {
      const clientId = req.query.clientId || 'default';
      const calendars = await calendarService.getAvailableCalendars(clientId);
      res.json(calendars);
    } catch (error) {
      console.error('Error fetching calendars:', error);
      res.status(500).json({
        error: 'Failed to fetch calendars',
        details: error.message
      });
    }
  },
  async triggerSync(req, res) {
    try {
      const { clientId = 'default' } = req.query;
      await calendarService.syncGoogleCalendarEvents(clientId);
      res.json({ success: true, message: 'Sync triggered successfully' });
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      res.status(500).json({
        error: 'Failed to trigger sync',
        details: error.message
      });
    }
  },
  async cancelReservation(req, res) {
    try {
      const { id } = req.params;
      const reservation = await calendarService.cancelReservation(id);
      res.json(reservation);
    } catch (error) {
      console.error('Error in cancelReservation controller:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Reservation not found'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async updateReservation(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const reservation = await calendarService.updateReservation(id, updateData);
      res.json(reservation);
    } catch (error) {
      console.error('Error in updateReservation controller:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Reservation not found'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  // Google Calendar同期管理機能
  async initiateSync(req, res) {
    try {
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({
          error: 'Client ID is required'
        });
      }

      const authUrl = await calendarService.generateAuthUrl(clientId);
      res.json({
        success: true,
        authUrl,
        message: 'Please complete authentication'
      });
    } catch (error) {
      console.error('Error in initiateSync controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async saveGoogleToken(req, res) {
    try {
        const { accessToken, expiresIn } = req.body;
        if (!accessToken) {
            return res.status(400).json({
                error: 'Access token is required'
            });
        }

        // トークンの保存とカレンダー同期の初期化
        const syncStatus = await calendarService.initializeSync(accessToken, expiresIn);
        res.json(syncStatus);
    } catch (error) {
        console.error('Error in saveGoogleToken controller:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
},


  async handleOAuthCallback(req, res) {
    try {
      const { code, state } = req.query; // stateにclientIdが含まれている
      if (!code || !state) {
        return res.status(400).json({
          error: 'Authorization code and state are required'
        });
      }

      const syncStatus = await calendarService.completeSyncSetup(code, state);
      res.json({
        success: true,
        syncStatus
      });
    } catch (error) {
      console.error('Error in handleOAuthCallback controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  // calendar.controller.jsに追加
async updateSyncCalendar(req, res) {
  try {
    const { calendarId } = req.body;
    // clientIdの取得方法を修正（認証トークンから取得するなど）
    const clientId = req.clientId || 'default'; // 認証システムに応じて適切に修正

    if (!calendarId) {
      return res.status(400).json({
        error: 'Calendar ID is required'
      });
    }

    const result = await calendarService.updateSyncCalendar(clientId, calendarId);
    
    res.json({
      success: true,
      message: 'Calendar updated successfully',
      calendar: result
    });
  } catch (error) {
    console.error('Error in updateSyncCalendar:', error);
    res.status(500).json({
      error: 'Failed to update sync calendar',
      details: error.message
    });
  }
},
  async getSyncStatus(req, res) {
    try {
      const { clientId } = req.query;
      if (!clientId) {
        return res.status(400).json({
          error: 'Client ID is required'
        });
      }

      const status = await calendarService.getSyncStatus(clientId);
      res.json(status);
    } catch (error) {
      console.error('Error in getSyncStatus controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async getTimeSlots(req, res) {
    try {
      const { start, end } = req.query;

      if (!start || !end) {
        return res.status(400).json({
          error: 'Start and end dates are required'
        });
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      const slots = await calendarService.getTimeSlots(startDate, endDate);
      res.json(slots);
    } catch (error) {
      console.error('Error in getTimeSlots controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async getBusinessHours(req, res) {
    try {
      const { clientId } = req.query;
      const businessHours = await calendarService.getBusinessHours(clientId);
      res.json(businessHours);
    } catch (error) {
      console.error('Error in getBusinessHours controller:', error);
      res.status(500).json({
        error: 'Failed to get business hours',
        details: error.message
      });
    }
  },

  // 営業時間設定の更新
  async updateBusinessHours(req, res) {
    try {
      const { clientId } = req.query;
      const updatedSettings = await calendarService.updateBusinessHours(clientId, req.body);
      res.json(updatedSettings);
    } catch (error) {
      console.error('Error in updateBusinessHours controller:', error);
      res.status(500).json({
        error: 'Failed to update business hours',
        details: error.message
      });
    }
  },


  async disconnectSync(req, res) {
    try {
      const { clientId } = req.body;
      if (!clientId) {
        return res.status(400).json({
          error: 'Client ID is required'
        });
      }

      await calendarService.disconnectSync(clientId);
      res.json({
        success: true,
        message: 'Calendar sync disconnected successfully'
      });
    } catch (error) {
      console.error('Error in disconnectSync controller:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  }
};