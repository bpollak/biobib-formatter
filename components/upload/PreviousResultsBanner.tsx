import { Box, Button, Typography, Alert } from '@mui/material';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const PreviousResultsBanner = () => {
  const router = useRouter();
  const [hasPrevious, setHasPrevious] = useState(false);
  const [previousData, setPreviousData] = useState<any | null>(null);

  useEffect(() => {
    // Check for any previous results in sessionStorage
    const keys = Object.keys(sessionStorage);
    const dissertationKeys = keys.filter(key => key.startsWith('dissertation-formatter-results-'));
    
    if (dissertationKeys.length > 0) {
      // Get the most recent one
      const latestKey = dissertationKeys[dissertationKeys.length - 1];
      try {
        const data = JSON.parse(sessionStorage.getItem(latestKey)!);
        setPreviousData(data);
        setHasPrevious(true);
      } catch (e) {
        // Invalid JSON
      }
    }
  }, []);

  if (!hasPrevious || !previousData) return null;

  const { summary, metadata } = previousData;
  
  return (
    <Box sx={{ bgColor: 'info.light', borderRadius: 2, p: 3, mb: 4 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <strong>Previous Submission:</strong> {metadata.fileName}
        </Typography>
      </Alert>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ minWidth: 120 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Status:
          </Typography>
          <Typography variant="h6" sx={{ color: 
            summary.overallStatus === 'pass' ? 'success.main' : 
            summary.overallStatus === 'needs-attention' ? 'warning.main' : 
            'error.main'
          }}>
            {summary.overallStatus === 'pass' ? 'PASS' : 
             summary.overallStatus === 'needs-attention' ? 'NEEDS ATTENTION' : 'FAIL'}
          </Typography>
        </Box>
        
        <Box sx={{ minWidth: 120 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Score:
          </Typography>
          <Typography variant="h6">
            {summary.passed}/{summary.total} ({Math.round((summary.passed / summary.total) * 100)}%)
          </Typography>
        </Box>
        
        <Box sx={{ minWidth: 120 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Auto-fixed:
          </Typography>
          <Typography variant="h6" sx={{ color: 'info.main' }}>
            {summary.autoFixed}
          </Typography>
        </Box>
        
        <Box sx={{ minWidth: 120 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Manual fixes:
          </Typography>
          <Typography variant="h6" sx={{ color: 'error.main' }}>
            {summary.failed}
          </Typography>
        </Box>
      </Box>
      
      <Box sx={{ mt: 3, textAlign: 'right' }}>
        <Button 
          variant="text"
          size="small"
          onClick={() => {
            // Clear previous results
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
              if (key.startsWith('dissertation-formatter-results-')) {
                sessionStorage.removeItem(key);
              }
            });
            setHasPrevious(false);
            router.refresh();
          }}
        >
          Clear Previous Results
        </Button>
      </Box>
    </Box>
  );
};