import { Box, Typography, Stack, Alert } from '@mui/material';

interface ResubmitComparisonProps {
  previous: any;
  current: any;
}

export const ResubmitComparison = ({ previous, current }: ResubmitComparisonProps) => {
  const prevSummary = previous.summary;
  const currSummary = current.summary;
  
  const calculateImprovement = (prev: number, curr: number) => {
    const diff = curr - prev;
    if (diff > 0) return `+${diff} improved`;
    if (diff < 0) return `${diff} regressed`;
    return 'No change';
  };
  
  return (
    <Box sx={{ bgColor: 'info.light', borderRadius: 2, p: 4, mb: 4 }}>
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          🔄 Resubmission Comparison
        </Typography>
      </Alert>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Comparing your current submission with the previous one:
        </Typography>
        <Stack spacing={2} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Rules Passed:
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                {prevSummary.passed} → {currSummary.passed}
              </Typography>
              <Typography variant="body2" sx={{ color: 
                currSummary.passed > prevSummary.passed ? 'success.main' :
                currSummary.passed < prevSummary.passed ? 'error.main' : 'text.secondary'
              }}>
                {calculateImprovement(prevSummary.passed, currSummary.passed)}
              </Typography>
            </Box>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Rules Failed:
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                {prevSummary.failed} → {currSummary.failed}
              </Typography>
              <Typography variant="body2" sx={{ color: 
                currSummary.failed < prevSummary.failed ? 'success.main' :
                currSummary.failed > prevSummary.failed ? 'error.main' : 'text.secondary'
              }}>
                {calculateImprovement(prevSummary.failed, currSummary.failed)}
              </Typography>
            </Box>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Score:
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                {Math.round((prevSummary.passed / prevSummary.total) * 100)}% → 
                {Math.round((currSummary.passed / currSummary.total) * 100)}%
              </Typography>
              <Typography variant="body2" sx={{ color: 
                (currSummary.passed / currSummary.total) > (prevSummary.passed / prevSummary.total) ? 'success.main' :
                (currSummary.passed / currSummary.total) < (prevSummary.passed / prevSummary.total) ? 'error.main' : 'text.secondary'
              }}>
                {calculateImprovement(
                  Math.round((prevSummary.passed / prevSummary.total) * 100),
                  Math.round((currSummary.passed / currSummary.total) * 100)
                )}
              </Typography>
            </Box>
          </Box>
          
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Auto-Fixed:
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                {prevSummary.autoFixed} → {currSummary.autoFixed}
              </Typography>
              <Typography variant="body2" sx={{ color: 
                currSummary.autoFixed > prevSummary.autoFixed ? 'success.main' :
                currSummary.autoFixed < prevSummary.autoFixed ? 'error.main' : 'text.secondary'
              }}>
                {calculateImprovement(prevSummary.autoFixed, currSummary.autoFixed)}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </Box>
      
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 500 }}>
          {currSummary.overallStatus === 'pass' && prevSummary.overallStatus !== 'pass' 
            ? 'Congratulations! Your document now passes all formatting checks!' 
            : currSummary.overallStatus === 'pass' 
              ? 'Your document maintains passing status!' 
              : currSummary.overallStatus === 'needs-attention' && prevSummary.overallStatus === 'fail'
                ? 'Significant improvement! Continued progress toward compliance.' 
                : 'Keep working on the remaining formatting issues.'}
        </Typography>
      </Box>
    </Box>
  );
};