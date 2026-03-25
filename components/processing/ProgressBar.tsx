import { Box, CircularProgress, Typography, Stack } from '@mui/material';

interface ProgressBarProps {
  value: number; // 0-100
}

export const ProgressBar = ({ value }: ProgressBarProps) => {
  return (
    <Box sx={{ width: '100%', maxWidth: 500, mx: 'auto' }}>
      <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>
        Processing: {value}%
      </Typography>
      <Box sx={{ height: 8, bgColor: 'grey.200', borderRadius: 4 }}>
        <Box 
          sx={{ 
            width: `${value}%`, 
            height: '100%', 
            bgColor: 'primary.main', 
            borderRadius: 4,
            transition: 'width 0.3s ease-in-out'
          }} 
        />
      </Box>
    </Box>
  );
};