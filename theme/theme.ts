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
      default: '#fafafa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
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