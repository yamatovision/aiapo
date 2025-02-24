// widget/src/components/Chat/ChatWidget.jsx
import { useState, useEffect } from 'react';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import { useAI } from '../../hooks/useAI';
import SimpleWeekView from '../Calendar/SimpleWeekView';
import ReservationForm from '../Forms/ReservationForm';
import { calendarAPI } from "../../../../api";
import { lineAPI } from '../../../../api';
import LineConnectGuide from '../LineConnect/LineConnectGuide';



const EVENT_TYPES = {
  WIDGET_READY: 'WIDGET_READY',
  WIDGET_TOGGLE: 'WIDGET_TOGGLE',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  RESERVATION_SUBMIT: 'RESERVATION_SUBMIT'
};

function ChatWidget({ 
  config,
  messages: initialMessages,
  isProcessing: externalProcessing,
  error: externalError,
  onSendMessage: externalSendMessage,
  showCalendar: externalShowCalendar,
  showForm: externalShowForm,
  selectedDateTime: externalSelectedDateTime,
  onTimeSelect: externalTimeSelect,
  onFormSubmit: externalFormSubmit,
  onFormCancel: externalFormCancel,
  onClose: externalClose
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [messages, setMessages] = useState(initialMessages || [{
    id: 1,
    type: 'bot',
    content: '個別相談にご関心をお寄せいただきありがとうございます。\n具体的にどんなAIツールを作りたいと思われているか一言でお伝えください。'
  }]);
  const [showForm, setShowForm] = useState(externalShowForm || false);
  const [selectedDateTime, setSelectedDateTime] = useState(externalSelectedDateTime || null);

  const [showLineConnect, setShowLineConnect] = useState(false);
  const [currentReservation, setCurrentReservation] = useState(null);

  const { 
    processMessage, 
    isProcessing, 
    showCalendar, 
    setShowCalendar, 
    error 
  } = useAI();

  useEffect(() => {
    window.parent.postMessage({ 
      type: EVENT_TYPES.WIDGET_READY,
      payload: { ready: true }
    }, '*');

    const handleMessage = (event) => {
      const { type, payload } = event.data;
      switch (type) {
        case EVENT_TYPES.WIDGET_TOGGLE:
          setIsVisible(payload.visible);
          break;
        default:
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  

  const handleSendMessage = async (message) => {
    if (!message.trim()) return;

    setMessages(prev => [...prev, {
      id: prev.length + 1,
      type: 'user',
      content: message
    }]);

    window.parent.postMessage({
      type: EVENT_TYPES.CHAT_MESSAGE,
      payload: { message }
    }, '*');

    setMessages(prev => [...prev, {
      id: prev.length + 1,
      type: 'bot',
      content: ''
    }]);

    const history = messages.map(msg => ({
      type: msg.type,
      content: msg.content
    }));

    await processMessage(message, history, (chunk) => {
      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            ...msg,
            content: msg.content + chunk.content
          };
        }
        return msg;
      }));
    });
  };

  const handleTimeSelect = (day, hour) => {
    const selectedTime = new Date(day);
    selectedTime.setHours(hour, 0, 0, 0);
    setSelectedDateTime(selectedTime);
    setShowCalendar(false);
    setShowForm(true);
  };
  const handleFormSubmit = async (formData) => {
    console.log('Form submission started', { formData, selectedDateTime });
    try {
      // フォームデータの検証
      if (!formData.name || !formData.email || !formData.phone) {
        throw new Error('必須項目が入力されていません');
      }
  
      // 送信データの構造を修正
      const reservationData = {
        clientId: config.clientId || 'default',
        datetime: selectedDateTime.toISOString(),
        status: 'pending',
        customerInfo: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company || '',
          message: formData.message || ''
        },
        lineNotification: {
          enabled: Boolean(formData.lineNotification)
        }
      };
  
      // デバッグ用にデータを出力
      console.log('Sending reservation data:', JSON.stringify(reservationData, null, 2));
  
      const reservation = await calendarAPI.createReservation(reservationData);
      console.log('Reservation created:', reservation);
  
      if (reservation && reservation._id) {
        setCurrentReservation(reservation);
  
        if (formData.lineNotification) {
          setShowForm(false);
          setShowLineConnect(true);
        } else {
          showCompletionMessage(formData, selectedDateTime);
        }
      } else {
        throw new Error('予約の作成に失敗しました');
      }
  
    } catch (error) {
      console.error('Reservation submission error:', error);
      const errorMessage = error.response?.data?.details 
        ? `予約の作成に失敗しました:\n${error.response.data.details.join('\n')}`
        : error.message || '予約の作成に失敗しました';
  
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        type: 'bot',
        content: errorMessage
      }]);
    }
  };




  // 完了メッセージ表示関数
  const showCompletionMessage = (formData, selectedDateTime) => {
    const confirmationMessage = `
  予約を承りました。
  
  日時：${selectedDateTime.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}
  お名前：${formData.name}
  メールアドレス：${formData.email}
  電話番号：${formData.phone}
  ${formData.company ? `会社名：${formData.company}\n` : ''}
  ${formData.message ? `ご要望：${formData.message}` : ''}
  ${formData.lineNotification ? 'LINE通知: 有効\n' : ''}
  
  ご予約の確認メールをお送りいたしましたので、ご確認ください。
  当日は担当者より改めてご連絡させていただきます。
    `.trim();
  
    setShowForm(false);
    setShowLineConnect(false);
    setMessages(prev => [...prev, {
      id: prev.length + 1,
      type: 'bot',
      content: confirmationMessage
    }]);
  };

  return isVisible ? (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '800px',
        height: '600px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '8px',
        background: 'white',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 1300,
        animation: 'fadeIn 0.3s ease-in-out'
      }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}
      </style>
      <ChatHeader onClose={() => {
        setIsVisible(false);
        window.parent.postMessage({
          type: EVENT_TYPES.WIDGET_TOGGLE,
          payload: { visible: false }
        }, '*');
      }} />
      
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden' 
      }}>
        {error && (
          <div style={{ margin: '4px' }}>
            <div style={{ 
              padding: '6px 16px',
              backgroundColor: '#fdeded',
              color: '#5f2120',
              borderRadius: '4px',
              marginBottom: '8px'
            }}>
              {error}
            </div>
          </div>
        )}

        {!showCalendar && !showForm && (
          <ChatMessages 
            messages={messages}
            error={error}
            isProcessing={isProcessing}
          />
        )}

        {showCalendar && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'white',
            zIndex: 2,
            overflow: 'auto'
          }}>
            <SimpleWeekView onTimeSelect={handleTimeSelect} />
          </div>
        )}
{showForm && (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 2
  }}>
    <ReservationForm 
      onSubmit={handleFormSubmit}
      onCancel={() => setShowForm(false)}
      selectedDateTime={selectedDateTime}  // 追加
      clientId={config.clientId}          // 追加
    />
  </div>
)}


{showLineConnect && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'white',
            zIndex: 2
          }}>
            <LineConnectGuide
              reservationId={currentReservation._id}
              onComplete={() => {
                setShowLineConnect(false);
                showCompletionMessage(currentReservation.customerInfo, selectedDateTime);
              }}
            />
          </div>
        )}

        {!showCalendar && !showForm && (
          <ChatInput 
            onSendMessage={handleSendMessage}
            disabled={isProcessing}
          />
        )}
      </div>
    </div>
  ) : null;
}


export default ChatWidget;