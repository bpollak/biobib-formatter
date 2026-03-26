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
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ResultsAccordion from '@/components/ResultsAccordion';
import ChangeLog from '@/components/ChangeLog';
import ManualFixes from '@/components/ManualFixes';
import { ValidationResults } from '@/lib/types';

function OverallStatusBadge({ status }: { status: string }) {
  if (status === 'pass') {
    return (
      <Chip
        label="✅ PASS"
        sx={{ backgroundColor: '#E8F5E9', color: '#2E7D32', fontWeight: 700, fontSize: 14, px: 1, height: 32 }}
      />
    );
  }
  if (status === 'needs-attention') {
    return (
      <Chip
        label="⚠️ NEEDS ATTENTION"
        sx={{ backgroundColor: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 14, px: 1, height: 32 }}
      />
    );
  }
  return (
    <Chip
      label="❌ FAIL"
      sx={{ backgroundColor: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14, px: 1, height: 32 }}
    />
  );
}

function SummaryStats({ summary }: { summary: ValidationResults['summary'] }) {
  const stats = [
    { label: 'Total Checks', value: summary.total, color: '#182B49' },
    { label: 'Passed', value: summary.passed, color: '#2E7D32' },
    { label: 'Failed', value: summary.failed, color: '#C62828' },
    { label: 'Warnings', value: summary.warned, color: '#E65100' },
    { label: 'Auto-Fixed', value: summary.autoFixed, color: '#01579B' },
    { label: 'Skipped', value: summary.skipped, color: '#757575' },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
      {stats.map(s => (
        <Box key={s.label} sx={{ textAlign: 'center', minWidth: 70 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: s.color, lineHeight: 1 }}>
            {s.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {s.label}
          </Typography>
        </Box>
      ))}
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
  const [correctedFileB64, setCorrectedFileB64] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('dissertation');

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }
    const stored = sessionStorage.getItem(`results_${sessionId}`);
    const storedFile = sessionStorage.getItem(`correctedFile_${sessionId}`);
    const storedName = sessionStorage.getItem(`originalFileName_${sessionId}`);
    if (stored) {
      try {
        setResults(JSON.parse(stored));
        if (storedFile) setCorrectedFileB64(storedFile);
        if (storedName) setOriginalFileName(storedName);
      } catch {
        setError('Failed to load results');
      }
    } else {
      setError('Results not found. The session may have expired.');
    }
    setLoading(false);
  }, [sessionId]);

  async function downloadFile(type: 'docx' | 'report') {
    if (!sessionId) return;
    setDownloading(type);
    try {
      if (type === 'docx') {
        // Use base64-encoded corrected file stored in sessionStorage
        if (!correctedFileB64) {
          throw new Error('Corrected file not available. Please re-upload your document.');
        }
        const byteCharacters = atob(correctedFileB64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${originalFileName.replace(/\.docx$/i, '')}_corrected.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Report still uses the server endpoint (not session-dependent in the same way)
        const res = await fetch(`/api/download/${sessionId}/report`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Download failed');
        }
        const blob = await res.blob();
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
      alert(err instanceof Error ? err.message : 'Download failed');
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
            ← Start Over
          </Button>
        </Container>
        <Footer />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        {/* Summary Card */}
        <Paper elevation={2} sx={{ p: 4, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#182B49', mb: 0.5 }}>
                Formatting Check Results
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {results.metadata.fileName} &nbsp;•&nbsp;{' '}
                {results.metadata.type} &nbsp;•&nbsp;{' '}
                {results.metadata.degreeType}
              </Typography>
              <SummaryStats summary={results.summary} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <OverallStatusBadge status={results.summary.overallStatus} />
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Download Buttons */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              onClick={() => downloadFile('docx')}
              disabled={downloading === 'docx'}
              sx={{ backgroundColor: '#182B49', '&:hover': { backgroundColor: '#1e3a6e' } }}
            >
              {downloading === 'docx' ? '⏳ Downloading...' : '📄 Download Corrected Document'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => downloadFile('report')}
              disabled={downloading === 'report'}
              sx={{ borderColor: '#182B49', color: '#182B49', '&:hover': { borderColor: '#C69214', color: '#C69214' } }}
            >
              {downloading === 'report' ? '⏳ Generating...' : '📋 Download Compliance Report (PDF)'}
            </Button>
            <Button
              variant="text"
              onClick={() => router.push('/')}
              sx={{ color: '#182B49' }}
            >
              ← Check Another Document
            </Button>
          </Box>
        </Paper>

        {/* Manual Fixes */}
        {results.manualFixes.length > 0 && (
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#C62828', mb: 2 }}>
              🛠️ Manual Fixes Required ({results.manualFixes.length})
            </Typography>
            <ManualFixes fixes={results.manualFixes} />
          </Paper>
        )}

        {/* Changelog */}
        {results.changes.length > 0 && (
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#01579B', mb: 2 }}>
              🔧 Auto-Applied Changes ({results.changes.length})
            </Typography>
            <ChangeLog changes={results.changes} />
          </Paper>
        )}

        {/* Compliance Checklist */}
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#182B49', mb: 3 }}>
            📋 Full Compliance Checklist
          </Typography>
          <ResultsAccordion rules={results.rules} />
        </Paper>
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
