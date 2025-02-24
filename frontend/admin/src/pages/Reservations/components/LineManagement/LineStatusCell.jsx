import React from 'react';
import { Stack, Chip, Avatar, Tooltip, Typography } from '@mui/material';
import { Message as MessageIcon } from '@mui/icons-material';

const LineStatusCell = ({ reservation }) => {  // propsをreservationに変更
  console.log('=== LineStatusCell Debug ===');
  console.log('Reservation:', reservation);
  
  // lineConnection状態の確認
  const lineConnection = reservation?.lineConnection;
  const isConnected = lineConnection?.status === 'connected';
  
  console.log('LineConnection status:', {
    isConnected,
    status: lineConnection?.status,
    lineUserId: lineConnection?.lineUserId
  });

  if (!isConnected) {
    console.log('Rendering: 未連携');
    return (
      <Chip
        size="small"
        label={lineConnection?.status === 'pending' ? '連携待ち' : '未連携'}
        color={lineConnection?.status === 'pending' ? 'warning' : 'default'}
      />
    );
  }

  console.log('Rendering: 連携中');
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={
        lineConnection.connectedAt
          ? `連携日時: ${new Date(lineConnection.connectedAt).toLocaleString()}`
          : '連携済み'
      }>
        <Chip
          size="small"
          label="連携中"
          color="success"
          avatar={<MessageIcon sx={{ width: 16, height: 16 }} />}
        />
      </Tooltip>
      {lineConnection.lineDisplayName && (
        <Typography variant="caption" color="text.secondary">
          {lineConnection.lineDisplayName}
        </Typography>
      )}
    </Stack>
  );
};

export default LineStatusCell;