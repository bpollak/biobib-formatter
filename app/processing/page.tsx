'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function Processing() {
  const params = useParams();
  const sessionId = params?.sessionId as string | undefined;
  const router = useRouter();
  const [status, setStatus] = useState('uploading');
  const [stage, setStage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!sessionId) return;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/status/${sessionId}`);
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        setStatus(data.status);
        setStage(data.stage || '');
        setProgress(data.progress || 0);
        if (data.status === 'complete') {
          router.push(`/results?sessionId=${sessionId}`);
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    };

    const interval = setInterval(checkStatus, 2000);
    checkStatus();
    return () => clearInterval(interval);
  }, [sessionId, router]);

  if (!sessionId) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <Box component="main" sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography>Invalid session</Typography>
        </Box>
        <Footer />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Box component="main" sx={{ flex: 1, bgcolor: 'background.default', py: 4 }}>
        <Container sx={{ maxWidth: '1170px !important' }}>
          <Typography variant="h2" sx={{ mb: 4, textAlign: 'center', color: '#182B49' }}>
            Processing Your Document
          </Typography>
          <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <Paper elevation={2} sx={{ p: 4, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <CircularProgress size={24} sx={{ color: '#182B49' }} />
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#182B49' }}>
                  {stage}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 8, borderRadius: 4,
                  '& .MuiLinearProgress-bar': { backgroundColor: '#182B49', borderRadius: 4 },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 1 }}>
                {Math.round(progress)}%
              </Typography>
            </Paper>
            {status === 'error' && (
              <Paper sx={{ p: 3, backgroundColor: '#FFEBEE' }}>
                <Typography color="error">Processing failed. Please try again.</Typography>
                <Button variant="contained" sx={{ mt: 2, backgroundColor: '#182B49' }} onClick={() => router.push('/')}>
                  Start Over
                </Button>
              </Paper>
            )}
            {status === 'complete' && (
              <Box sx={{ textAlign: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  sx={{ backgroundColor: '#182B49' }}
                  onClick={() => router.push(`/results?sessionId=${sessionId}`)}
                >
                  View Results
                </Button>
              </Box>
            )}
          </Box>
        </Container>
      </Box>

      <Footer />
    </Box>
  );
}
