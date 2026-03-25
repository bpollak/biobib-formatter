import { Box, FormControl, FormLabel, RadioGroup, Radio, FormControlLabel } from '@mui/material';

export const DegreeTypeSelector = () => {
  return (
    <FormControl sx={{ width: '100%' }} component="fieldset">
      <FormLabel component="legend">Degree Type</FormLabel>
      <RadioGroup 
        name="degreeType"
        value="doctoral" 
        aria-label="degree type"
        sx={{ mt: 2 }}
      >
        <FormControlLabel 
          value="doctoral" 
          control={<Radio />} 
          label="Doctoral" 
          labelPlacement="start"
        />
        <FormControlLabel 
          value="masters" 
          control={<Radio />} 
          label="Master's" 
          labelPlacement="start"
        />
      </RadioGroup>
    </FormControl>
  );
};