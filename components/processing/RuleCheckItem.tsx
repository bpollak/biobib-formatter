// This component is not currently used in the RuleCheckList above
// Keeping it for potential future use
import { Box, Typography } from '@mui/material';

interface RuleCheckItemProps {
  ruleId: string;
  name: string;
  status: 'pending' | 'checking' | 'pass' | 'fail' | 'warning';
}

export const RuleCheckItem = ({ ruleId, name, status }: RuleCheckItemProps) => {
  const statusColors: Record<string, string> = {
    pending: 'text.secondary',
    checking: 'info.main',
    pass: 'success.main',
    fail: 'error.main',
    warning: 'warning.main',
  };

  const statusIcons: Record<string, string> = {
    pending: '⏳',
    checking: '⏳',
    pass: '✅',
    fail: '❌',
    warning: '⚠️',
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
      <Box sx={{ width: 24, textAlign: 'center', flexShrink: 0 }}>
        <Typography variant="body2">{statusIcons[status]}</Typography>
      </Box>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2">{name}</Typography>
      </Box>
      <Box sx={{ width: 60, textAlign: 'right', flexShrink: 0 }}>
        <Typography variant="body2" sx={{ color: statusColors[status] }}>
          {status.toUpperCase()}
        </Typography>
      </Box>
    </Box>
  );
};