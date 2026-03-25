'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { ChangeRecord } from '@/lib/types';

interface ChangeLogProps {
  changes: ChangeRecord[];
}

export default function ChangeLog({ changes }: ChangeLogProps) {
  if (changes.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 3, backgroundColor: '#F5F7FA', border: '1px solid #E0E0E0', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          No auto-fixes were applied.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {changes.map((change, i) => (
        <Paper
          key={i}
          elevation={0}
          sx={{
            p: 2,
            border: '1px solid #BBDEFB',
            backgroundColor: '#F3F9FF',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 16 }}>🔧</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#182B49', flexGrow: 1 }}>
              {change.description}
            </Typography>
            <Chip
              size="small"
              label={change.ruleId}
              sx={{ backgroundColor: '#E3F2FD', color: '#01579B', fontFamily: 'monospace', fontSize: 10 }}
            />
          </Box>
          {change.location && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              📍 {change.location}
            </Typography>
          )}
          {(change.before || change.after) && (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                mt: 0.5,
                flexWrap: 'wrap',
              }}
            >
              {change.before && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#757575', fontWeight: 500 }}>Before:</Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      backgroundColor: '#FFEBEE',
                      color: '#C62828',
                      fontFamily: 'monospace',
                    }}
                  >
                    {change.before}
                  </Typography>
                </Box>
              )}
              {change.after && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#757575', fontWeight: 500 }}>After:</Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      backgroundColor: '#E8F5E9',
                      color: '#2E7D32',
                      fontFamily: 'monospace',
                    }}
                  >
                    {change.after}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      ))}
    </Box>
  );
}
