import { Box, Typography } from '@mui/material';

export const AppFooter = () => {
  return (
    <Box sx={{ bgcolor: '#182B49', color: 'white', pt: 3, pb: 3, textAlign: 'center' }}>
      <Typography variant="body2" sx={{ mb: 2 }}>
        GEPA Dissertation Formatting Agent • Powered by TritonAI
      </Typography>
      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
        © {new Date().getFullYear()} UC San Diego. All rights reserved.
      </Typography>
    </Box>
  );
};