import { Box, Container } from '@mui/material';

export const PageContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <Container maxWidth="xl" sx={{ pt: 4, pb: 4 }}>
      {children}
    </Container>
  );
};