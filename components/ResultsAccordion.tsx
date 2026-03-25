'use client';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { RuleResult, RuleCategory } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/constants';

interface ResultsAccordionProps {
  rules: RuleResult[];
}

function statusIcon(status: string) {
  switch (status) {
    case 'pass': return '✅';
    case 'fail': return '❌';
    case 'warning': return '⚠️';
    case 'auto-fixed': return '🔧';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}

function statusChipProps(status: string) {
  switch (status) {
    case 'pass': return { label: 'Pass', sx: { backgroundColor: '#E8F5E9', color: '#2E7D32', fontWeight: 600 } };
    case 'fail': return { label: 'Fail', sx: { backgroundColor: '#FFEBEE', color: '#C62828', fontWeight: 600 } };
    case 'warning': return { label: 'Warning', sx: { backgroundColor: '#FFF3E0', color: '#E65100', fontWeight: 600 } };
    case 'auto-fixed': return { label: 'Auto-Fixed', sx: { backgroundColor: '#E3F2FD', color: '#01579B', fontWeight: 600 } };
    case 'skipped': return { label: 'Skipped', sx: { backgroundColor: '#F5F5F5', color: '#757575', fontWeight: 600 } };
    default: return { label: status, sx: {} };
  }
}

export default function ResultsAccordion({ rules }: ResultsAccordionProps) {
  // Group rules by category
  const categories = Object.keys(CATEGORY_LABELS) as RuleCategory[];
  
  const grouped: Record<string, RuleResult[]> = {};
  for (const rule of rules) {
    if (!grouped[rule.category]) grouped[rule.category] = [];
    grouped[rule.category].push(rule);
  }

  return (
    <Box>
      {categories.map((cat) => {
        const catRules = grouped[cat];
        if (!catRules || catRules.length === 0) return null;

        const failed = catRules.filter(r => r.status === 'fail').length;
        const warned = catRules.filter(r => r.status === 'warning').length;
        const passed = catRules.filter(r => r.status === 'pass').length;
        const fixed = catRules.filter(r => r.status === 'auto-fixed').length;
        const hasIssues = failed > 0 || warned > 0;

        return (
          <Accordion key={cat} defaultExpanded={hasIssues} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                <Typography sx={{ fontWeight: 600, color: '#182B49', flexGrow: 1 }}>
                  {CATEGORY_LABELS[cat] || cat}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
                  {passed > 0 && (
                    <Chip size="small" label={`${passed} ✅`} sx={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: 11 }} />
                  )}
                  {fixed > 0 && (
                    <Chip size="small" label={`${fixed} 🔧`} sx={{ backgroundColor: '#E3F2FD', color: '#01579B', fontSize: 11 }} />
                  )}
                  {warned > 0 && (
                    <Chip size="small" label={`${warned} ⚠️`} sx={{ backgroundColor: '#FFF3E0', color: '#E65100', fontSize: 11 }} />
                  )}
                  {failed > 0 && (
                    <Chip size="small" label={`${failed} ❌`} sx={{ backgroundColor: '#FFEBEE', color: '#C62828', fontSize: 11 }} />
                  )}
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {catRules.map((rule) => (
                  <Box
                    key={rule.ruleId}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 2,
                      p: 1.5,
                      borderRadius: 1,
                      backgroundColor: rule.status === 'fail' ? 'rgba(198,40,40,0.03)' : 'transparent',
                      border: rule.status === 'fail' ? '1px solid rgba(198,40,40,0.1)' : '1px solid transparent',
                    }}
                  >
                    <Typography sx={{ fontSize: 16, lineHeight: 1.5, width: 22, textAlign: 'center', flexShrink: 0 }}>
                      {statusIcon(rule.status)}
                    </Typography>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {rule.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#9e9e9e', fontFamily: 'monospace' }}>
                          {rule.ruleId}
                        </Typography>
                        <Chip size="small" {...statusChipProps(rule.status)} />
                        {rule.severity === 'critical' && (
                          <Chip size="small" label="Critical" sx={{ backgroundColor: '#FFEBEE', color: '#b71c1c', fontSize: 10 }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {rule.message}
                      </Typography>
                      {rule.details && (
                        <Typography variant="caption" sx={{ display: 'block', color: '#E65100', mt: 0.25 }}>
                          {rule.details}
                        </Typography>
                      )}
                      {rule.manualFixInstruction && rule.status === 'fail' && (
                        <Typography variant="caption" sx={{ display: 'block', color: '#01579B', mt: 0.5, fontStyle: 'italic' }}>
                          💡 {rule.manualFixInstruction}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
