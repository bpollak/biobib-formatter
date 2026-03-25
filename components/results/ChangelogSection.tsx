import { Box, Typography, List, ListItem, ListItemIcon, Alert } from '@mui/material';
import { ContentPaste as ChangeIcon } from '@mui/icons-material';

interface ChangelogSectionProps {
  results: any;
}

export const ChangelogSection = ({ results }: ChangelogSectionProps) => {
  const { changes } = results;
  
  if (!changes || changes.length === 0) {
    return null;
  }
  
  return (
    <Box sx={{ bgColor: 'background.paper', borderRadius: 2, p: 4, mb: 4 }}>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ChangeIcon fontSize="inherit" />
          Here's What We Changed
        </Typography>
      </Alert>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The following formatting issues were automatically corrected:
        </Typography>
        <List>
          {changes.map((change: any, index: number) => (
            <ListItem key={index} sx={{ py: 1 }}>
              <ListItemIcon sx={{ color: 'info.main', mb: 0 }}>
                🔧
              </ListItemIcon>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
                  {change.description}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                  Location: {change.location}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                  Before: {change.before} → After: {change.after}
                </Typography>
              </Box>
            </ListItem>
          ))}
        </List>
      </Box>
      
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          {changes.length} automatic formatting correction(s) applied
        </Typography>
      </Box>
    </Box>
  );
};