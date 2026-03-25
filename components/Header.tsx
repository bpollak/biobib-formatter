'use client';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

export default function Header() {
  return (
    <Box component="header" sx={{ width: '100%' }}>
      {/* Main header bar */}
      <Box sx={{ backgroundColor: '#182B49', width: '100%' }}>
        <Box
          sx={{
            maxWidth: 1200,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Site title */}
          <Box>
            <Link href="/" underline="none" sx={{ display: 'block' }}>
              <Typography
                variant="h6"
                component="div"
                sx={{
                  color: '#FFFFFF',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  fontSize: { xs: '1rem', sm: '1.15rem' },
                  letterSpacing: '-0.01em',
                }}
              >
                Dissertation Formatting Agent
              </Typography>
            </Link>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255,255,255,0.75)',
                fontWeight: 400,
                fontSize: '0.75rem',
                letterSpacing: '0.01em',
              }}
            >
              Graduate Division (GEPA)
            </Typography>
          </Box>

          {/* Right: UC San Diego wordmark */}
          <Box>
            <Link href="https://ucsd.edu" target="_blank" rel="noopener noreferrer" underline="none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://cdn.ucsd.edu/cms/decorator-5/styles/img/ucsd-footer-logo-white.png"
                alt="UC San Diego"
                style={{ height: 36, display: 'block' }}
              />
            </Link>
          </Box>
        </Box>
      </Box>

      {/* Gold accent line */}
      <Box sx={{ height: 4, backgroundColor: '#C69214', width: '100%' }} />
    </Box>
  );
}
