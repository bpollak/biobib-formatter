'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Stack from '@mui/material/Stack';
import { RuleResultItem } from './RuleResultItem';

interface RuleCategoryAccordionProps {
  category: string;
  rules: any[];
}

export const RuleCategoryAccordion = ({ category, rules }: RuleCategoryAccordionProps) => {
  const passed = rules.filter(r => r.status === 'pass').length;
  const failed = rules.filter(r => r.status === 'fail').length;
  const warned = rules.filter(r => r.status === 'warning').length;
  const autoFixed = rules.filter(r => r.status === 'auto-fixed').length;
  const total = rules.length;
  
  const getStatusIcon = () => {
    if (failed > 0) return '❌';
    if (warned > 0) return '⚠️';
    if (autoFixed > 0) return '🔧';
    return '✅';
  };
  
  const getStatusText = () => {
    if (failed > 0) return `${failed} failed`;
    if (warned > 0) return `${warned} warnings`;
    if (autoFixed > 0) return `${autoFixed} fixed`;
    return 'All passed';
  };
  
  return (
    <Box sx={{ mb: 3 }}>
      <Accordion 
        sx={{ borderRadius: 2, boxShadow: 0 }}
        disableGutters
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            bgColor: 'grey.50',
            '&.Mui-expanded': {
              margin: 0,
              minHeight: 56,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" sx={{ mb: 0 }}>
                {category}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {passed}/{total} rules passed
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {getStatusIcon()} {getStatusText()}
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ pt: 0 }}>
          <Stack spacing={1}>
            {rules.map(rule => (
              <RuleResultItem key={rule.ruleId} rule={rule} />
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
