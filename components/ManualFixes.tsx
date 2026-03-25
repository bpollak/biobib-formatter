'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { ManualFix } from '@/lib/types';

interface ManualFixesProps {
  fixes: ManualFix[];
}

function severityColor(severity: string) {
  switch (severity) {
    case 'critical': return { bg: '#FFEBEE', color: '#b71c1c', label: 'Critical' };
    case 'major': return { bg: '#FFF3E0', color: '#E65100', label: 'Major' };
    case 'minor': return { bg: '#F5F5F5', color: '#757575', label: 'Minor' };
    default: return { bg: '#F5F5F5', color: '#757575', label: severity };
  }
}

export default function ManualFixes({ fixes }: ManualFixesProps) {
  if (fixes.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 3, backgroundColor: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 20 }}>🎉</Typography>
          <Typography variant="body2" sx={{ color: '#2E7D32', fontWeight: 500 }}>
            No manual fixes required! All issues were either passing or auto-corrected.
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Sort: critical first, then major, then minor
  const sortedFixes = [...fixes].sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {sortedFixes.map((fix, i) => {
        const sev = severityColor(fix.severity);
        return (
          <Paper
            key={i}
            elevation={0}
            sx={{
              p: 2,
              border: `1px solid ${sev.bg}`,
              borderLeft: `4px solid ${sev.color}`,
              borderRadius: 2,
              backgroundColor: '#FFFFFF',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Typography
                sx={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#9e9e9e',
                  lineHeight: 1.5,
                  minWidth: 28,
                }}
              >
                {i + 1}.
              </Typography>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#182B49' }}>
                    {fix.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={sev.label}
                    sx={{ backgroundColor: sev.bg, color: sev.color, fontWeight: 600, fontSize: 10 }}
                  />
                  <Chip
                    size="small"
                    label={fix.ruleId}
                    sx={{ backgroundColor: '#F5F5F5', color: '#757575', fontFamily: 'monospace', fontSize: 10 }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: fix.location ? 0.75 : 0 }}>
                  {fix.instruction}
                </Typography>
                {fix.location && (
                  <Typography variant="caption" sx={{ color: '#01579B' }}>
                    📍 {fix.location}
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
