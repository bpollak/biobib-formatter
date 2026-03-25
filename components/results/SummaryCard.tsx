import { Box, Button, Typography, Stack, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';

interface SummaryCardProps {
  results: any;
}

export const SummaryCard = ({ results }: SummaryCardProps) => {
  const router = useRouter();
  const { summary } = results;
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'success.main';
      case 'needs-attention': return 'warning.main';
      case 'fail': return 'error.main';
      default: return 'text.secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pass': return 'PASS';
      case 'needs-attention': return 'NEEDS ATTENTION';
      case 'fail': return 'FAIL';
      default: return 'UNKNOWN';
    }
  };

  return (
    <Box sx={{ bgColor: 'background.paper', borderRadius: 2, p: 4, mb: 4 }}>
      <Alert 
        severity={summary.overallStatus === 'pass' ? 'success' : 
                  summary.overallStatus === 'needs-attention' ? 'warning' : 'error'}
        sx={{ mb: 3 }}
      >
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          Overall Status: {getStatusText(summary.overallStatus)}
        </Typography>
      </Alert>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Formatting Check Summary
        </Typography>
        <Stack spacing={2} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Rules Passed:
            </Typography>
            <Typography variant="h5" sx={{ color: 'success.main' }}>
              {summary.passed}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Rules Failed:
            </Typography>
            <Typography variant="h5" sx={{ color: 'error.main' }}>
              {summary.failed}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Warnings:
            </Typography>
            <Typography variant="h5" sx={{ color: 'warning.main' }}>
              {summary.warned}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Auto-Fixed:
            </Typography>
            <Typography variant="h5" sx={{ color: 'info.main' }}>
              {summary.autoFixed}
            </Typography>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Score:
            </Typography>
            <Typography variant="h4" sx={{ 
              color: summary.passed === summary.total ? 'success.main' :
                     summary.passed / summary.total >= 0.8 ? 'warning.main' : 'error.main'
            }}>
              {Math.round((summary.passed / summary.total) * 100)}%
            </Typography>
          </Box>
        </Stack>
      </Box>
      
      <Box sx={{ textAlign: 'right' }}>
        <Button 
          variant="outlined"
          size="small"
          onClick={() => {
            // Clear results and go back to upload
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
              if (key.startsWith('dissertation-formatter-results-')) {
                sessionStorage.removeItem(key);
              }
            });
            router.push('/');
          }}
        >
          Submit Another Document
        </Button>
      </Box>
    </Box>
  );
};