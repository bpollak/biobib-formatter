'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuIcon from '@mui/icons-material/Menu';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: 'About', href: '/about' },
];

export default function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md')); // 768px+

  const handleDrawerClose = () => setDrawerOpen(false);
  const handleDrawerOpen = () => setDrawerOpen(true);

  return (
    <Box component="header" sx={{ width: '100%' }}>


      {/* White title section — desktop only */}
      {isDesktop && (
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
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML =
                      '<span style="font-family: Roboto, sans-serif; font-weight: 700; font-size: 1.1rem; color: #182B49; letter-spacing: 0.5px;">UC San Diego</span>';
                  }
                }}
              />
            </Link>
          </Box>
        </Box>
      )}

      {/* Nav bar */}
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
          {isDesktop ? (
            /* Desktop: horizontal nav links */
            NAV_LINKS.map(({ label, href }) => (
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
            ))
          ) : (
            /* Mobile: hamburger + UCSD logo */
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                py: 0.5,
              }}
            >
              {/* Left: hamburger button */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <IconButton
                  onClick={handleDrawerOpen}
                  aria-label="Open navigation menu"
                  sx={{
                    color: '#ffffff',
                    borderRadius: 0,
                    px: 1.5,
                    py: 1,
                    gap: 0.75,
                    '&:hover': { backgroundColor: '#004268' },
                  }}
                >
                  <MenuIcon sx={{ fontSize: 22 }} />
                  <Box
                    component="span"
                    sx={{
                      fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Menu
                  </Box>
                </IconButton>
              </Box>

              {/* Right: UC San Diego logo */}
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
                  style={{ height: 36, display: 'block' }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML =
                        '<span style="font-family: Roboto, sans-serif; font-weight: 700; font-size: 0.9rem; color: #ffffff; letter-spacing: 0.5px;">UC San Diego</span>';
                    }
                  }}
                />
              </Link>
            </Box>
          )}
        </Box>
      </Box>

      {/* Mobile: slide-in nav drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={handleDrawerClose}
        slotProps={{
          paper: {
            sx: {
              width: 280,
              backgroundColor: '#00629b',
              color: '#ffffff',
            },
          },
        }}
      >
        {/* Close button */}
        <Box
          sx={{
            backgroundColor: '#004268',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 1.25,
          }}
        >
          <IconButton
            onClick={handleDrawerClose}
            aria-label="Close navigation menu"
            sx={{
              color: '#ffffff',
              borderRadius: 0,
              px: 0,
              gap: 0.75,
              '&:hover': { backgroundColor: 'transparent', opacity: 0.8 },
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                fontSize: '0.875rem',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              ✕ Close Nav
            </Box>
          </IconButton>
        </Box>

        {/* Nav links */}
        <List disablePadding>
          {NAV_LINKS.map(({ label, href }) => (
            <ListItem key={label} disablePadding divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <ListItemButton
                component="a"
                href={href}
                onClick={handleDrawerClose}
                sx={{
                  px: 3,
                  py: 1.5,
                  '&:hover': { backgroundColor: '#004268' },
                }}
              >
                <ListItemText
                  primary={label}
                  slotProps={{
                    primary: {
                      sx: {
                        color: '#ffffff',
                        fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                        fontSize: '1rem',
                        fontWeight: 400,
                      },
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
    </Box>
  );
}
