'use client';

import Box from '@mui/material/Box';

export default function Footer() {
  const links = [
    { label: 'Accessibility', href: 'https://accessibility.ucsd.edu/' },
    { label: 'Privacy', href: 'https://ucsd.edu/about/privacy.html' },
    { label: 'Terms of Use', href: 'https://ucsd.edu/about/terms-of-use.html' },
    { label: 'Feedback', href: 'mailto:gepa@ucsd.edu' },
  ];

  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: '#182B49',
        color: '#fff',
        py: 3,
        px: { xs: 2, sm: 3 },
        mt: 'auto',
        fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
        fontSize: '0.8125rem',
      }}
    >
      <Box
        sx={{
          maxWidth: 1170,
          mx: 'auto',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 2, sm: 0 },
        }}
      >
        {/* Left column */}
        <Box sx={{ flex: '0 0 66.666%', maxWidth: { sm: '66.666%' } }}>
          <Box component="p" sx={{ m: 0, lineHeight: 1.6 }}>
            <Box component="span">
              UC San Diego 9500 Gilman Dr. La Jolla, CA 92093 (858) 534-2230
            </Box>
            <br />
            <Box component="span">
              Copyright &copy;{' '}
              <Box component="span">{new Date().getFullYear()}</Box>{' '}
              Regents of the University of California. All rights reserved.
            </Box>
          </Box>
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: '0.5em 0 0',
              p: 0,
              '& li': {
                display: 'inline',
                borderRight: '1px solid #fff',
                mr: '0.5em',
                pr: '0.75em',
                '&:last-child': {
                  borderRight: 'none',
                },
              },
              '& a': {
                color: '#fff',
                textDecoration: 'underline',
                fontSize: '0.8125rem',
                '&:hover': {
                  color: 'rgba(255,255,255,0.8)',
                },
              },
            }}
          >
            {links.map(({ label, href }) => (
              <Box component="li" key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Right column — UCSD logo */}
        <Box
          sx={{
            flex: '0 0 33.333%',
            maxWidth: { sm: '33.333%' },
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'flex-start' },
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          }}
        >
          <a href="https://ucsd.edu/" target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png"
              alt="UCSD homepage"
              style={{ width: 158, height: 30 }}
            />
          </a>
        </Box>
      </Box>
    </Box>
  );
}
