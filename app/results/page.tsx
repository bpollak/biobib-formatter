'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ResultsAccordion from '@/components/ResultsAccordion';
import { ValidationResults, RuleResult } from '@/lib/types';
import { generateReportPDFClient } from '@/lib/pipeline/reporter-client';

// Content rule IDs — issues where the student must change document content
const CONTENT_RULE_PREFIXES = [
  'ABSTRACT-001', 'ABSTRACT-002', 'ABSTRACT-003',
  'APPROVAL-', 'ORDER-', 'TITLE-',
  'REF-004', 'REF-005',
  'FIG-001', 'FIG-002', 'FIG-003', 'FIG-004', 'FIG-005', 'FIG-007', 'FIG-008',
  'A11Y-002', 'A11Y-003', 'A11Y-005',
  'TEXT-003',
];

function isContentRule(ruleId: string): boolean {
  return CONTENT_RULE_PREFIXES.some(prefix => ruleId.startsWith(prefix));
}

function BucketSection({
  title,
  icon,
  message,
  color,
  bgColor,
  borderColor,
  count,
  children,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ReactNode;
  message: string;
  color: string;
  bgColor: string;
  borderColor: string;
  count: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  if (count === 0) return null;
  return (
    <Paper elevation={2} sx={{ mb: 3, overflow: 'hidden' }}>
      <Accordion defaultExpanded={defaultExpanded} disableGutters sx={{ boxShadow: 'none' }}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ backgroundColor: bgColor, borderBottom: `1px solid ${borderColor}`, px: 3, py: 1 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {icon}
            <Typography variant="h2" sx={{ color, fontSize: { xs: 18, sm: 20 } }}>
              {title}
            </Typography>
            <Chip
              label={count}
              size="small"
              sx={{ backgroundColor: color, color: '#fff', fontWeight: 700, fontSize: 13, minWidth: 28 }}
            />
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 3, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {message}
          </Typography>
          {children}
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}

function FixedItem({ rule }: { rule: RuleResult }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        py: 1,
        px: 1.5,
        borderRadius: 1,
        '&:not(:last-child)': { borderBottom: '1px solid #E8F5E9' },
      }}
    >
      <CheckCircleOutlineIcon sx={{ color: '#2E7D32', fontSize: 20, mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.name}</Typography>
          <Typography variant="caption" sx={{ color: '#9e9e9e', fontFamily: 'monospace' }}>{rule.ruleId}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{rule.message}</Typography>
      </Box>
    </Box>
  );
}

function ActionRequiredItem({ rule }: { rule: RuleResult }) {
  const sevColors: Record<string, { bg: string; color: string }> = {
    critical: { bg: '#FFEBEE', color: '#b71c1c' },
    major: { bg: '#FFF3E0', color: '#E65100' },
    minor: { bg: '#F5F5F5', color: '#757575' },
  };
  const sev = sevColors[rule.severity] || sevColors.minor;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        border: '1px solid #FFE0B2',
        borderLeft: `4px solid ${sev.color}`,
        borderRadius: 2,
        backgroundColor: '#FFFFFF',
        mb: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#182B49' }}>
          {rule.name}
        </Typography>
        <Chip size="small" label={rule.severity} sx={{ backgroundColor: sev.bg, color: sev.color, fontWeight: 600, fontSize: 10, textTransform: 'capitalize' }} />
        <Chip size="small" label={rule.ruleId} sx={{ backgroundColor: '#F5F5F5', color: '#757575', fontFamily: 'monospace', fontSize: 10 }} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: rule.manualFixInstruction ? 0.75 : 0 }}>
        {rule.message}
      </Typography>
      {rule.details && (
        <Typography variant="caption" sx={{ display: 'block', color: '#E65100', mt: 0.25 }}>
          {rule.details}
        </Typography>
      )}
      {rule.manualFixInstruction && (
        <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, backgroundColor: '#FFF8E1' }}>
          <Typography variant="caption" sx={{ color: '#E65100', fontWeight: 600 }}>
            How to fix:
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: '#5D4037' }}>
            {rule.manualFixInstruction}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function VerifyItem({ rule }: { rule: RuleResult }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        py: 1,
        px: 1.5,
        borderRadius: 1,
        '&:not(:last-child)': { borderBottom: '1px solid #E3F2FD' },
      }}
    >
      <VisibilityIcon sx={{ color: '#1565C0', fontSize: 20, mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.name}</Typography>
          <Typography variant="caption" sx={{ color: '#9e9e9e', fontFamily: 'monospace' }}>{rule.ruleId}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{rule.message}</Typography>
        {rule.details && (
          <Typography variant="caption" sx={{ display: 'block', color: '#1565C0', mt: 0.25 }}>
            {rule.details}
          </Typography>
        )}
        {rule.manualFixInstruction && (
          <Typography variant="caption" sx={{ display: 'block', color: '#01579B', mt: 0.5, fontStyle: 'italic' }}>
            What to look for: {rule.manualFixInstruction}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function ResultsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [results, setResults] = useState<ValidationResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'docx' | 'report' | null>(null);
  const [correctedFileUrl, setCorrectedFileUrl] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('dissertation');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }
    const stored = sessionStorage.getItem(`results_${sessionId}`);
    const storedFileUrl = sessionStorage.getItem(`correctedFileUrl_${sessionId}`);
    const storedName = sessionStorage.getItem(`originalFileName_${sessionId}`);
    if (stored) {
      try {
        setResults(JSON.parse(stored));
        if (storedFileUrl) setCorrectedFileUrl(storedFileUrl);
        if (storedName) setOriginalFileName(storedName);
      } catch {
        setError('Failed to load results');
      }
    } else {
      setError('Results not found. The session may have expired.');
    }
    setLoading(false);
  }, [sessionId, router]);

  async function downloadFile(type: 'docx' | 'report') {
    if (!sessionId) return;
    setDownloading(type);
    setDownloadError(null);
    try {
      if (type === 'docx') {
        if (!correctedFileUrl) {
          throw new Error('Corrected file not available. Please re-upload your document.');
        }
        const a = document.createElement('a');
        a.href = correctedFileUrl;
        // The Vercel Blob URL will enforce the correct content-disposition and filename automatically
        a.setAttribute('download', `${originalFileName.replace(/\\.docx$/i, '')}_corrected.docx`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        if (!results) {
          throw new Error('Results not available. Please re-upload your document.');
        }
        // Generate PDF client-side to avoid session storage issues on Vercel
        const pdfBytes = await generateReportPDFClient(results);
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${originalFileName.replace(/\.docx$/i, '')}_compliance_report.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress sx={{ color: '#182B49' }} />
        </Box>
        <Footer />
      </Box>
    );
  }

  if (error || !results) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header />
        <Container maxWidth="md" sx={{ py: 5, flexGrow: 1 }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            {error || 'Results not available'}
          </Alert>
          <Button variant="contained" onClick={() => router.push('/')} sx={{ backgroundColor: '#182B49' }}>
            Start Over
          </Button>
        </Container>
        <Footer />
      </Box>
    );
  }

  // Bucket the rules
  const fixedRules = results.rules.filter(r => r.status === 'auto-fixed');
  const actionRules = results.rules.filter(r => r.status === 'fail' && !r.autoFixable);
  const verifyRules = results.rules.filter(r => r.status === 'warning');

  // Sub-divide action rules into content vs formatting
  const contentIssues = actionRules.filter(r => isContentRule(r.ruleId));
  const formattingIssues = actionRules.filter(r => !isContentRule(r.ruleId));

  const hasFailures = actionRules.length > 0;
  const hasAutoFixes = fixedRules.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        {downloadError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDownloadError(null)}>
            {downloadError}
          </Alert>
        )}

        {/* Summary Bar */}
        <Paper
          elevation={2}
          sx={{
            p: 3,
            mb: 3,
            background: hasFailures
              ? 'linear-gradient(135deg, #FFF8E1 0%, #FFFFFF 100%)'
              : 'linear-gradient(135deg, #E8F5E9 0%, #FFFFFF 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box>
              <Typography variant="h1" sx={{ color: '#182B49', mb: 0.5 }}>
                Formatting Check Results
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {results.metadata.fileName} &nbsp;&bull;&nbsp;{' '}
                {results.metadata.type} &nbsp;&bull;&nbsp;{' '}
                {results.metadata.degreeType}
              </Typography>
            </Box>
            <Chip
              label={hasFailures ? 'Review Required' : 'Ready to Download'}
              sx={{
                backgroundColor: hasFailures ? '#FFF3E0' : '#E8F5E9',
                color: hasFailures ? '#E65100' : '#2E7D32',
                fontWeight: 700,
                fontSize: 14,
                px: 1.5,
                height: 36,
              }}
            />
          </Box>

          {/* Summary counts */}
          <Box sx={{ display: 'flex', gap: { xs: 2, sm: 4 }, flexWrap: 'wrap', mb: 2.5 }}>
            {fixedRules.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CheckCircleOutlineIcon sx={{ color: '#2E7D32', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E7D32' }}>
                  {fixedRules.length} auto-fixed
                </Typography>
              </Box>
            )}
            {actionRules.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <WarningAmberIcon sx={{ color: '#E65100', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#E65100' }}>
                  {actionRules.length} require your attention
                </Typography>
              </Box>
            )}
            {verifyRules.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <VisibilityIcon sx={{ color: '#1565C0', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1565C0' }}>
                  {verifyRules.length} to verify manually
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 2.5 }} />

          {/* Download Buttons */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {hasAutoFixes ? (
              <Button
                variant="contained"
                size="large"
                onClick={() => downloadFile('docx')}
                disabled={downloading === 'docx'}
                sx={{
                  backgroundColor: '#2E7D32',
                  '&:hover': { backgroundColor: '#1B5E20' },
                  fontWeight: 700,
                  px: 4,
                }}
              >
                {downloading === 'docx' ? 'Downloading...' : 'Download Corrected File'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => downloadFile('docx')}
                disabled={downloading === 'docx'}
                sx={{ backgroundColor: '#182B49', '&:hover': { backgroundColor: '#1e3a6e' } }}
              >
                {downloading === 'docx' ? 'Downloading...' : 'Download Document'}
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={() => downloadFile('report')}
              disabled={downloading === 'report'}
              sx={{ borderColor: '#182B49', color: '#182B49', '&:hover': { borderColor: '#C69214', color: '#C69214' } }}
            >
              {downloading === 'report' ? 'Generating...' : 'Download Compliance Report (PDF)'}
            </Button>
            <Button
              variant="text"
              onClick={() => router.push('/')}
              sx={{ color: '#182B49' }}
            >
              Check Another Document
            </Button>
          </Box>
        </Paper>

        {/* Bucket 1: Fixed For You */}
        <BucketSection
          title="Fixed For You"
          icon={<CheckCircleOutlineIcon sx={{ color: '#2E7D32', fontSize: 24 }} />}
          message="These formatting issues were automatically corrected in your downloaded file."
          color="#2E7D32"
          bgColor="#E8F5E9"
          borderColor="#C8E6C9"
          count={fixedRules.length}
        >
          {fixedRules.map(rule => (
            <FixedItem key={rule.ruleId} rule={rule} />
          ))}
        </BucketSection>

        {/* Bucket 2: Action Required */}
        <BucketSection
          title="Action Required"
          icon={<WarningAmberIcon sx={{ color: '#E65100', fontSize: 24 }} />}
          message="These issues require you to edit your document before submitting to GEPA."
          color="#E65100"
          bgColor="#FFF3E0"
          borderColor="#FFE0B2"
          count={actionRules.length}
        >
          {contentIssues.length > 0 && (
            <Box sx={{ mb: formattingIssues.length > 0 ? 3 : 0 }}>
              <Typography variant="subtitle2" sx={{ color: '#182B49', fontWeight: 700, mb: 1.5, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5 }}>
                Content Issues ({contentIssues.length})
              </Typography>
              {contentIssues.map(rule => (
                <ActionRequiredItem key={rule.ruleId} rule={rule} />
              ))}
            </Box>
          )}
          {formattingIssues.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#182B49', fontWeight: 700, mb: 1.5, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5 }}>
                Formatting Issues ({formattingIssues.length})
              </Typography>
              {formattingIssues.map(rule => (
                <ActionRequiredItem key={rule.ruleId} rule={rule} />
              ))}
            </Box>
          )}
        </BucketSection>

        {/* Bucket 3: Please Verify */}
        <BucketSection
          title="Please Verify"
          icon={<VisibilityIcon sx={{ color: '#1565C0', fontSize: 24 }} />}
          message="These items cannot be automatically checked. Please review them manually before submitting."
          color="#1565C0"
          bgColor="#E3F2FD"
          borderColor="#BBDEFB"
          count={verifyRules.length}
        >
          {verifyRules.map(rule => (
            <VerifyItem key={rule.ruleId} rule={rule} />
          ))}
        </BucketSection>

        {/* All Rules — expandable detail view */}
        <Accordion disableGutters sx={{ boxShadow: 'none', border: '1px solid #E0E0E0', borderRadius: '8px !important', overflow: 'hidden' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 3 }}>
            <Typography variant="h2" sx={{ color: '#182B49', fontSize: { xs: 16, sm: 18 } }}>
              Full Compliance Checklist ({results.rules.length} rules)
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 3, py: 0 }}>
            <ResultsAccordion rules={results.rules} />
          </AccordionDetails>
        </Accordion>
      </Container>

      <Footer />
    </Box>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: '#182B49' }} />
      </Box>
    }>
      <ResultsPageInner />
    </Suspense>
  );
}
