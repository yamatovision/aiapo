import { useState } from 'react';
import { 
  Box, 
  Typography, 
  Button,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import LineConnectGuide from '../LineConnect/LineConnectGuide';
import { lineAPI } from '../../api';


function ReservationComplete({ reservation, onClose }) {
  const [activeStep, setActiveStep] = useState(reservation.lineNotification ? 0 : 1);
  const [error, setError] = useState(null);

  const steps = [
    {
      label: 'LINE通知の設定',
      optional: true,
      condition: reservation?.lineNotification
    },
    {
      label: '予約完了',
      optional: false
    }
  ];
  
  // LINE連携完了後の処理
  const handleLineConnectComplete = async () => {
    try {
      await lineAPI.enableNotification(reservation._id);
      setActiveStep(1);
    } catch (error) {
      console.error('LINE notification activation failed:', error);
      setError('LINE通知の設定に失敗しました。後ほど再度お試しください。');
    }
  };
  {error && (
    <Typography color="error" sx={{ mt: 2 }}>
      {error}
    </Typography>
  )}
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <LineConnectGuide 
            reservationId={reservation._id}
            onComplete={handleLineConnectComplete}
          />
        );
      case 1:
        return (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              予約が完了しました
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              予約確認メールをお送りしましたので、ご確認ください。
            </Typography>
            <Button 
              variant="contained"
              onClick={onClose}
            >
              閉じる
            </Button>
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      {reservation.lineNotification && (
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}
      {renderStepContent()}
    </Box>
  );
}

export default ReservationComplete;
