import { Box, Button, Typography, TextField } from '@mui/material';
import { useState } from 'react';

interface UploadFormProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export const UploadForm = ({ children, onSubmit }: UploadFormProps) => {
  const [type, setType] = useState<'dissertation' | 'thesis'>('dissertation');
  const [degreeType, setDegreeType] = useState<'doctoral' | 'masters'>('doctoral');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form data will be collected by the FormData in the parent page handler
    await onSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit} encType="multipart/form-data">
      {children}
      <Box sx={{ mt: 4 }}>
        <Button 
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          sx={{ width: '100%' }}
        >
          Check Formatting
        </Button>
      </Box>
    </form>
  );
};