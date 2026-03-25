'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: '#182B49',
        color: '#FFFFFF',
        py: 3,
        px: 4,
        mt: 'auto',
      }}
    >
      <Box
        sx={{
          maxWidth: 900,
          mx: 'auto',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="body2" sx={{ color: '#C69214', fontWeight: 600, mb: 0.5 }}>
            Graduate Division — GEPA
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            University of California San Diego
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Link
            href="https://grad.ucsd.edu/academics/preparing-filing-thesis-dissertation/index.html"
            target="_blank"
            rel="noopener"
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#C69214' } }}
          >
            GEPA Formatting Guide
          </Link>
          <Link
            href="https://grad.ucsd.edu"
            target="_blank"
            rel="noopener"
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#C69214' } }}
          >
            UC San Diego Graduate Division
          </Link>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          © {new Date().getFullYear()} UC San Diego
        </Typography>
      </Box>
    </Box>
  );
}
