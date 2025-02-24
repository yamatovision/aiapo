// frontend/widget/src/components/Calendar/SimpleWeekView.jsx
import { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  isSameDay
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { calendarAPI } from "../../../../api";

function SimpleWeekView({ onTimeSelect }) {
  const [timeSlots, setTimeSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [businessHours, setBusinessHours] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const start = startOfWeek(currentDate, { locale: ja });
        const end = endOfWeek(currentDate, { locale: ja });

        const [slotsData, reservationsData, hoursData] = await Promise.all([
          calendarAPI.getTimeSlots(
            format(start, 'yyyy-MM-dd'),
            format(end, 'yyyy-MM-dd')
          ),
          calendarAPI.getReservations(
            `?startDate=${format(start, 'yyyy-MM-dd')}&endDate=${format(end, 'yyyy-MM-dd')}`
          ),
          calendarAPI.getBusinessHours()
        ]);

        setTimeSlots(slotsData);
        setReservations(reservationsData);
        setBusinessHours(hoursData);
      } catch (err) {
        console.error('Data fetching error:', err);
        setError('予約可能な時間を取得できませんでした');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentDate]);

  const getBusinessHoursForDay = (date) => {
    if (!businessHours?.businessHours) return null;
    
    const dayNames = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday'
    };
    
    const dayOfWeek = dayNames[date.getDay()];
    const dayConfig = businessHours.businessHours[dayOfWeek];
    if (!dayConfig || !dayConfig.isOpen) return null;
    
    const [startHour] = dayConfig.start.split(':').map(Number);
    const [endHour] = dayConfig.end.split(':').map(Number);
    
    return {
      hours: Array.from(
        { length: endHour - startHour },
        (_, i) => startHour + i
      ),
      slots: dayConfig.slots
    };
  };

  const getSlotStatus = (day, hour) => {
    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
    const dateStr = format(day, 'yyyy-MM-dd');
    
    const slot = timeSlots.find(s => 
      s.date === dateStr && s.startTime === timeStr
    );

    if (!slot) return 'unavailable';
    if (slot.blocked) return 'blocked';

    const reservationCount = reservations.filter(r => {
      const rDate = new Date(r.datetime);
      return isSameDay(rDate, day) && rDate.getHours() === hour;
    }).length;

    if (reservationCount >= slot.capacity) return 'full';
    if (reservationCount > 0) return 'partial';
    return 'available';
  };

  const getSlotStyle = (status) => {
    const baseStyle = {
      height: '32px',
      padding: '4px',
      border: 1,
      borderColor: 'divider',
      position: 'relative',
    };

    switch (status) {
      case 'available':
        return {
          ...baseStyle,
          cursor: 'pointer',
          bgcolor: 'success.light',
          opacity: 0.6,
          '&:hover': {
            opacity: 0.8,
          }
        };
      case 'partial':
        return {
          ...baseStyle,
          cursor: 'pointer',
          bgcolor: 'warning.light',
          opacity: 0.6,
          '&:hover': {
            opacity: 0.8,
          }
        };
      default:
        return {
          ...baseStyle,
          bgcolor: 'grey.100',
          opacity: 0.1
        };
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate, { locale: ja }),
    end: endOfWeek(currentDate, { locale: ja })
  });

  // 営業時間から表示する時間帯を決定
  const displayHours = Array.from({ length: 24 }, (_, i) => i)
    .filter(hour => {
      return weekDays.some(day => {
        const businessHour = getBusinessHoursForDay(day);
        return businessHour && 
          hour >= businessHour.hours[0] && 
          hour < businessHour.hours[businessHour.hours.length - 1];
      });
    });

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        予約可能な日時
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={60} />
              {weekDays.map(day => (
                <TableCell
                  key={day.toISOString()}
                  align="center"
                  sx={{
                    bgcolor: isToday(day) ? 'primary.light' : 'transparent',
                    fontWeight: isToday(day) ? 'bold' : 'normal',
                    padding: '8px 4px',
                    borderBottom: 2,
                    borderColor: 'divider'
                  }}
                >
                  <Typography variant="body2" fontWeight={isToday(day) ? 'bold' : 'normal'}>
                    {format(day, 'M/d', { locale: ja })}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    display="block"
                    sx={{ color: 'text.secondary' }}
                  >
                    {format(day, '(E)', { locale: ja })}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayHours.map(hour => (
              <TableRow key={hour}>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </Typography>
                </TableCell>
                {weekDays.map(day => {
                  const status = getSlotStatus(day, hour);
                  const isClickable = ['available', 'partial'].includes(status);

                  return (
                    <TableCell
                      key={`${day.toISOString()}-${hour}`}
                      onClick={() => isClickable && onTimeSelect(day, hour)}
                      sx={getSlotStyle(status)}
                    >
                      {status === 'partial' && (
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'warning.dark',
                            fontWeight: 'bold'
                          }}
                        >
                          残
                        </Typography>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          ※ 緑色のマークは予約可能、黄色は残りわずか、グレーは予約不可を表しています
        </Typography>
      </Box>
    </Box>
  );
}

export default SimpleWeekView;