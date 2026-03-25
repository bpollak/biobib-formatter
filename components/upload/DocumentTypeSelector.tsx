'use client';

import { Box, FormControl, FormLabel, FormControlLabel, RadioGroup, Radio, Typography } from '@mui/material';

export const DocumentTypeSelector = () => {
  return (
    <FormControl sx={{ width: '100%' }} component="fieldset">
      <FormLabel component="legend">Document Type</FormLabel>
      <RadioGroup 
        name="documentType"
        value="dissertation" 
        aria-label="document type"
        sx={{ mt: 2 }}
      >
        <FormControlLabel 
          value="dissertation" 
          control={<Radio />} 
          label="Dissertation" 
          labelPlacement="start"
        />
        <FormControlLabel 
          value="thesis" 
          control={<Radio />} 
          label="Thesis" 
          labelPlacement="start"
        />
      </RadioGroup>
    </FormControl>
  );
};
