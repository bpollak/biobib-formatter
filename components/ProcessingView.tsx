'use client';

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';

interface ProcessingStep {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

interface ProcessingViewProps {
  progress: number;
  stage: string;
  steps?: ProcessingStep[];
}

const DEFAULT_STEPS: ProcessingStep[] = [
  { label: 'Parsing document structure...', status: 'pending' },
  { label: 'Checking margins...', status: 'pending' },
  { label: 'Checking fonts...', status: 'pending' },
  { label: 'Checking pagination...', status: 'pending' },
  { label: 'Checking page order...', status: 'pending' },
  { label: 'Checking title page...', status: 'pending' },
  { label: 'Checking abstract...', status: 'pending' },
  { label: 'Checking spacing & indentation...', status: 'pending' },
  { label: 'Checking figures & tables...', status: 'pending' },
  { label: 'Checking references...', status: 'pending' },
  { label: 'Applying auto-fixes...', status: 'pending' },
  { label: 'Generating report...', status: 'pending' },
];

function stepIcon(status: ProcessingStep['status']) {
  if (status === 'done') return '✅';
  if (status === 'active') return '⏳';
  if (status === 'error') return '❌';
  return '☐';
}

export default function ProcessingView({ progress, stage, steps }: ProcessingViewProps) {
  const displaySteps = steps || DEFAULT_STEPS;

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
      <Paper elevation={2} sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <CircularProgress size={28} sx={{ color: '#182B49' }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#182B49' }}>
              Checking Your Document
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stage || 'Processing...'}
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            mb: 3,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#E0E0E0',
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#182B49',
              borderRadius: 4,
            },
          }}
        />

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mb: 3 }}>
          {Math.round(progress)}% complete
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {displaySteps.map((step, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 0.5,
                opacity: step.status === 'pending' ? 0.45 : 1,
              }}
            >
              <Typography sx={{ fontSize: 16, lineHeight: 1, width: 20, textAlign: 'center' }}>
                {stepIcon(step.status)}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: step.status === 'active' ? 600 : 400,
                  color: step.status === 'active' ? '#182B49' : 'text.secondary',
                }}
              >
                {step.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
