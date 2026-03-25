'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { CATEGORY_LABELS } from '@/lib/constants';

interface RuleCheckListProps {
  completedRules: string[];
}

export const RuleCheckList = ({ completedRules }: RuleCheckListProps) => {
  const categories: Record<string, string[]> = {
    margins: ['MARGIN-001', 'MARGIN-002', 'MARGIN-003', 'MARGIN-004', 'MARGIN-005', 'MARGIN-006'],
    fonts: ['FONT-001', 'FONT-002', 'FONT-003', 'FONT-004', 'FONT-005', 'FONT-006'],
    spacing: ['SPACE-001', 'SPACE-002', 'SPACE-003', 'SPACE-004', 'SPACE-005'],
    indentation: ['INDENT-001', 'INDENT-002'],
    pagination: ['PAGE-001', 'PAGE-002', 'PAGE-003'],
    'title-page': ['TITLE-001', 'TITLE-002', 'TITLE-003'],
    abstract: ['ABSTRACT-001', 'ABSTRACT-002'],
    references: ['REF-001', 'REF-002', 'REF-003'],
    accessibility: ['A11Y-001', 'A11Y-002'],
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={1.5}>
        {Object.entries(categories).map(([category, ruleIds]) => {
          const completedInCategory = ruleIds.filter(id => completedRules.includes(id)).length;
          const totalInCategory = ruleIds.length;
          const percentage = totalInCategory > 0 ? Math.round((completedInCategory / totalInCategory) * 100) : 0;

          return (
            <Box key={category} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {CATEGORY_LABELS[category] || category}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {completedInCategory}/{totalInCategory}
                </Typography>
              </Box>
              <Box sx={{ height: 6, backgroundColor: 'grey.200', borderRadius: 3 }}>
                <Box
                  sx={{
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: percentage === 100 ? 'success.main' : 'primary.main',
                    borderRadius: 3,
                    transition: 'width 0.3s ease-in-out',
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};
