'use client';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: '#182B49',
        color: '#ffffff',
        pt: 4,
        pb: 3,
        mt: 'auto',
      }}
    >
      <Box
        sx={{
          maxWidth: 1170,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 3,
        }}
      >
        {/* Left / stacked: address + copyright + links */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Address */}
          <Box sx={{ fontSize: '0.875rem', color: '#ffffff', mb: 1, lineHeight: 1.7 }}>
            UC San Diego&nbsp;&nbsp;9500 Gilman Dr.&nbsp;&nbsp;La Jolla, CA 92093&nbsp;&nbsp;(858) 534-2230
          </Box>

          {/* Copyright */}
          <Box sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', mb: 1.5 }}>
            Copyright &copy; {new Date().getFullYear()} Regents of the University of California. All rights reserved.
          </Box>

          {/* Footer links */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Accessibility', href: 'https://www.ucsd.edu/accessibility/' },
              { label: 'Privacy', href: 'https://www.ucsd.edu/privacy/' },
              { label: 'Terms of Use', href: 'https://www.ucsd.edu/legal/' },
            ].map(({ label, href }, i) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      width: '1px',
                      height: '0.875rem',
                      backgroundColor: 'rgba(255,255,255,0.4)',
                      mx: 1.5,
                    }}
                  />
                )}
                <Link
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: '#ffffff',
                    fontSize: '0.8125rem',
                    textDecoration: 'underline',
                    fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                    '&:hover': { color: 'rgba(255,255,255,0.8)' },
                  }}
                >
                  {label}
                </Link>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Right / bottom: UCSD logo */}
        <Box sx={{ flexShrink: 0 }}>
          <Link href="https://ucsd.edu" target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png"
              alt="UC San Diego"
              style={{ height: 44, display: 'block' }}
            />
          </Link>
        </Box>
      </Box>
    </Box>
  );
}
