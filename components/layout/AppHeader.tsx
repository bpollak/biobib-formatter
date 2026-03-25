'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

export const AppHeader = () => {
  return (
    <AppBar position="static" sx={{ bgcolor: '#182B49' }}>
      <Toolbar sx={{ px: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <Typography variant="h6" color="white" sx={{ ml: 2, flexGrow: 1, textAlign: 'center' }}>
            UCSD Dissertation Formatting Agent
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="body2" color="white" sx={{ mr: 2 }}>
            GEPA Approved Tool
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
