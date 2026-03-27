import { createTheme, ThemeOptions } from '@mui/material/styles';
import { ucsdColors } from './ucsd-colors';

export const ucsdTheme = createTheme({
  palette: {
    primary: {
      main: ucsdColors.navy,
    },
    secondary: {
      main: ucsdColors.gold,
    },
    success: {
      main: ucsdColors.success,
    },
    error: {
      main: ucsdColors.error,
    },
    warning: {
      main: ucsdColors.warning,
    },
    info: {
      main: ucsdColors.info,
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    // UCSD CMS V5 — verified from blink.ucsd.edu kitchen-sink.html computed styles
    // H1-H2: Teko-SemiBold, weight 500, mixed case (no textTransform)
    // H3+: Roboto, weight 400, mixed case
    // Site title in header: Roboto 400, uppercase, 1.35rem (set in Header.tsx)
    h1: { fontFamily: "'Teko-SemiBold', sans-serif", fontWeight: 500, fontSize: '3.5rem' },
    h2: { fontFamily: "'Teko-SemiBold', sans-serif", fontWeight: 500, fontSize: '2.2rem' },
    h3: { fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: '1.44rem' },
    h4: { fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: '1.125rem' },
    h5: { fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: '1rem' },
    h6: { fontFamily: 'Roboto, sans-serif', fontWeight: 400, fontSize: '0.875rem' },
    body1: { fontFamily: 'Roboto, sans-serif', fontSize: '1rem' },
    body2: { fontFamily: 'Roboto, sans-serif', fontSize: '0.875rem' },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 4,
          padding: '8px 24px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: ucsdColors.navy,
        },
      },
    },
  },
} as ThemeOptions);

export default ucsdTheme;