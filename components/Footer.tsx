'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: '#182B49',
        color: '#FFFFFF',
        pt: 4,
        pb: 3,
        mt: 'auto',
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 } }}>
        {/* Top row: address + links */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
            mb: 2,
          }}
        >
          {/* Address */}
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.8125rem' }}>
            UC San Diego&nbsp;&nbsp;9500 Gilman Dr.&nbsp;&nbsp;La Jolla, CA 92093&nbsp;&nbsp;(858) 534-2230
          </Typography>

          {/* Links */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {[
              { label: 'Accessibility', href: 'https://www.ucsd.edu/accessibility/' },
              { label: 'Privacy', href: 'https://www.ucsd.edu/privacy/' },
              { label: 'Terms of Use', href: 'https://www.ucsd.edu/legal/' },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8125rem', '&:hover': { color: '#FFFFFF' } }}
              >
                {label}
              </Link>
            ))}
          </Box>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', mb: 2 }} />

        {/* Bottom row: copyright + powered by */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 1,
          }}
        >
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem' }}>
            Copyright &copy; {new Date().getFullYear()} Regents of the University of California. All rights reserved.
          </Typography>

        </Box>
      </Box>
    </Box>
  );
}
