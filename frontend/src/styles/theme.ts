import { createTheme, responsiveFontSizes } from '@mui/material/styles'

const baseTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'light',
    primary: { main: '#0d7f87', dark: '#075b62', contrastText: '#f7ffff' },
    secondary: { main: '#ff7a66' },
    error: { main: '#c53f4c' },
    background: { default: '#071518', paper: '#f5f8f6' },
    text: { primary: '#102a2d', secondary: '#5b6f71' },
  },
  typography: {
    fontFamily: 'Manrope, "Avenir Next", "Segoe UI", sans-serif',
    h1: { fontWeight: 750, letterSpacing: '-0.045em', lineHeight: 1.04 },
    h2: { fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.08 },
    button: { fontWeight: 750, letterSpacing: '-0.01em', textTransform: 'none' },
    overline: {
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontWeight: 600,
      letterSpacing: '0.12em',
    },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 52, borderRadius: 14, boxShadow: 'none' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 54,
          borderRadius: 14,
          backgroundColor: '#ffffff',
          transition: 'box-shadow 180ms ease, border-color 180ms ease',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#7ea5a7' },
          '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(13, 127, 135, 0.11)' },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginLeft: 4 } },
    },
  },
})

export const theme = responsiveFontSizes(baseTheme)
