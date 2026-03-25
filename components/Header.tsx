'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

export default function Header() {
  return (
    <AppBar position="static" sx={{ backgroundColor: '#182B49', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* UCSD Triton icon placeholder */}
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: '#C69214',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: 16,
              color: '#182B49',
              flexShrink: 0,
            }}
          >
            UC
          </Box>
          <Box>
            <Typography
              variant="h6"
              component="div"
              sx={{ color: '#FFFFFF', fontWeight: 700, lineHeight: 1.2 }}
            >
              Dissertation Formatting Agent
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#C69214', fontWeight: 500 }}
            >
              UC San Diego — Graduate Division (GEPA)
            </Typography>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
