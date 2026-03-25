import { Box, Typography, List, ListItem, ListItemIcon, Alert } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

interface ManualFixesSectionProps {
  results: any;
}

export const ManualFixesSection = ({ results }: ManualFixesSectionProps) => {
  const { manualFixes } = results;
  
  if (!manualFixes || manualFixes.length === 0) {
    return null;
  }
  
  return (
    <Box sx={{ bgColor: 'background.paper', borderRadius: 2, p: 4, mb: 4 }}>
      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <WarningIcon fontSize="inherit" />
          Manual Fixes Required
        </Typography>
      </Alert>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The following formatting issues require manual correction:
        </Typography>
        <List>
          {manualFixes.map((fix: any, index: number) => (
            <ListItem key={index} sx={{ py: 2 }}>
              <ListItemIcon sx={{ color: 'warning.main', mb: 0 }}>
                ⚠️
              </ListItemIcon>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500, color: 'error.main' }}>
                  {fix.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 0.5 }}>
                  {fix.instruction}
                </Typography>
                {fix.location && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem', fontStyle: 'italic' }}>
                    Location: {fix.location}
                  </Typography>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      </Box>
      
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          {manualFixes.length} manual correction(s) required
        </Typography>
      </Box>
    </Box>
  );
};