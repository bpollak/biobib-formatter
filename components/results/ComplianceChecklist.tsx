'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { RuleCategoryAccordion } from './RuleCategoryAccordion';
import { CATEGORY_LABELS } from '@/lib/constants';

interface ComplianceChecklistProps {
  results: any;
}

export const ComplianceChecklist = ({ results }: ComplianceChecklistProps) => {
  const { rules } = results;
  
  // Group rules by category
  const rulesByCategory: Record<string, any[]> = {};
  
  for (const rule of rules) {
    if (!rulesByCategory[rule.category]) {
      rulesByCategory[rule.category] = [];
    }
    rulesByCategory[rule.category].push(rule);
  }
  
  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
      {Object.entries(rulesByCategory).map(([category, categoryRules]) => (
        <RuleCategoryAccordion 
          key={category} 
          category={category} 
          rules={categoryRules} 
        />
      ))}
    </Box>
  );
};
