import { Box, Typography, Stack, Tooltip } from '@mui/material';

interface RuleResultItemProps {
  rule: any;
}

export const RuleResultItem = ({ rule }: RuleResultItemProps) => {
  const getStatusProps = () => {
    switch (rule.status) {
      case 'pass':
        return {
          label: 'PASS',
          color: 'success.main',
          icon: '✅',
          bg: 'success.light'
        };
      case 'fail':
        return {
          label: 'FAIL',
          color: 'error.main',
          icon: '❌',
          bg: 'error.light'
        };
      case 'warning':
        return {
          label: 'WARNING',
          color: 'warning.main',
          icon: '⚠️',
          bg: 'warning.light'
        };
      case 'auto-fixed':
        return {
          label: 'FIXED',
          color: 'info.main',
          icon: '🔧',
          bg: 'info.light'
        };
      case 'skipped':
        return {
          label: 'SKIPPED',
          color: 'text.secondary',
          icon: '⏭️',
          bg: 'grey.light'
        };
      default:
        return {
          label: 'UNKNOWN',
          color: 'text.secondary',
          icon: '❓',
          bg: 'grey.light'
        };
    }
  };
  
  const { label, color, icon, bg } = getStatusProps();
  
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider.light', py: 2 }}>
      <Tooltip title={rule.message || rule.name}>
        <Box sx={{ display: 'flex', alignItems: 'center', bgColor: bg, borderRadius: 1, p: 2 }}>
          <Box sx={{ width: 30, textAlign: 'center', flexShrink: 0 }}>
            <Typography variant="body2">{icon}</Typography>
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
              {rule.name}
            </Typography>
            {rule.details && (
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 0.5 }}>
                {rule.details}
              </Typography>
            )}
            {rule.manualFixInstruction && (
              <Typography variant="body2" sx={{ color: 'warning.main', fontSize: '0.875rem', fontStyle: 'italic' }}>
                💡 {rule.manualFixInstruction}
              </Typography>
            )}
          </Box>
          <Box sx={{ width: 60, textAlign: 'center', flexShrink: 0 }}>
            <Box sx={{ display: 'inline-block', px: 2, py: 0.5, borderRadius: 3, fontSize: '0.75rem', fontWeight: 500, color: color, bgColor: `${bg}80` }}>
              {label}
            </Box>
          </Box>
        </Box>
      </Tooltip>
      
      {rule.status === 'auto-fixed' && rule.changes && (
        <Box sx={{ mt: 1, ml: 8 }}>
          <Typography variant="body2" sx={{ color: 'info.main', fontSize: '0.875rem' }}>
            Changes applied: {rule.changes.length}
          </Typography>
        </Box>
      )}
    </Box>
  );
};