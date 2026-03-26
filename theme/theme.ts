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
    h1: { fontFamily: "'Teko-SemiBold', sans-serif", textTransform: 'uppercase', fontWeight: 600, fontSize: '2.5rem' },
    h2: { fontFamily: "'Teko-SemiBold', sans-serif", textTransform: 'uppercase', fontWeight: 600, fontSize: '2rem' },
    h3: { fontFamily: "'Teko-SemiBold', sans-serif", textTransform: 'uppercase', fontWeight: 600, fontSize: '1.75rem' },
    h4: { fontFamily: "'Teko-SemiBold', sans-serif", textTransform: 'uppercase', fontSize: '1.5rem' },
    h5: { fontFamily: "'Teko-SemiBold', sans-serif", textTransform: 'uppercase', fontSize: '1.25rem' },
    h6: { fontFamily: "'Teko-SemiBold', sans-serif", fontSize: '1rem' },
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