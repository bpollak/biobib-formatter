'use client';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

export default function Header() {
  return (
    <Box component="header" sx={{ width: '100%' }}>
      {/* Top teal color bar */}
      <Box sx={{ height: 8, backgroundColor: '#2b92b9', width: '100%' }} />

      {/* White title section */}
      <Box
        sx={{
          backgroundColor: '#ffffff',
          width: '100%',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <Box
          sx={{
            maxWidth: 1170,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: '1.5em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 92,
          }}
        >
          {/* Left: Site name */}
          <Link href="/" underline="none">
            <Box
              component="span"
              sx={{
                color: '#000000',
                fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                fontSize: '1.35rem',
                fontWeight: 400,
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              Dissertation Formatting Agent
            </Box>
          </Link>

          {/* Right: UC San Diego wordmark */}
          <Link
            href="https://ucsd.edu"
            target="_blank"
            rel="noopener noreferrer"
            underline="none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.ucsd.edu/_resources/img/logo_UCSD.png"
              alt="UC San Diego"
              style={{ height: 50, display: 'block' }}
              onError={(e) => {
                // Fallback to text if image fails
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = '<span style="font-family: Roboto, sans-serif; font-weight: 700; font-size: 1.1rem; color: #182B49; letter-spacing: 0.5px;">UC San Diego</span>';
                }
              }}
            />
          </Link>
        </Box>
      </Box>

      {/* Blue nav bar */}
      <Box
        component="nav"
        sx={{
          backgroundColor: '#00629b',
          width: '100%',
        }}
      >
        <Box
          sx={{
            maxWidth: 1170,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {[
            { label: 'Home', href: '/' },
            { label: 'How It Works', href: '#how-it-works' },
            { label: 'FAQ', href: '#faq' },
            { label: 'Contact GEPA', href: 'https://grad.ucsd.edu/academics/progress/dissertation-thesis.html' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              underline="none"
              sx={{
                color: '#ffffff',
                fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                fontSize: 16,
                fontWeight: 400,
                px: 2,
                py: 1.25,
                display: 'block',
                '&:hover': {
                  backgroundColor: '#004268',
                  color: '#ffffff',
                },
              }}
            >
              {label}
            </Link>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
