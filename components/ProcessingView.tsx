'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';

interface ProcessingViewProps {
  stage: string;
  /** Pass a number 0-100 during the upload phase to show a determinate bar.
   * Pass `null` (or omit) for the post-upload phase to show an indeterminate bar. */
  uploadPercent?: number | null;
  /** If provided, show a Cancel button that calls this. */
  onCancel?: () => void;
}

export default function ProcessingView({ stage, uploadPercent, onCancel }: ProcessingViewProps) {
  const isUploading = typeof uploadPercent === 'number';
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <CircularProgress size={32} sx={{ color: '#182B49' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h2" sx={{ color: '#182B49' }}>
              Checking Your Document
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stage || 'Processing...'}
            </Typography>
          </Box>
        </Box>

        {isUploading ? (
          // Real upload progress driven by @vercel/blob's onUploadProgress.
          <LinearProgress
            variant="determinate"
            value={uploadPercent}
            sx={{
              mb: 3,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#E0E0E0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#182B49',
                borderRadius: 3,
              },
            }}
          />
        ) : (
          // Post-upload phase: server is parsing/validating/auto-fixing.
          // We don't get progress events from /api/check (no streaming),
          // so don't fake a percentage.
          <LinearProgress
            sx={{
              mb: 3,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#E0E0E0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#182B49',
                borderRadius: 3,
              },
            }}
          />
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
            Large dissertations may take 30 seconds or more. Please don&apos;t close this tab.
          </Typography>
          {onCancel && (
            <Button
              variant="outlined"
              size="small"
              onClick={onCancel}
              sx={{ borderColor: '#B0BEC5', color: '#555', '&:hover': { borderColor: '#C62828', color: '#C62828' } }}
            >
              Cancel
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
