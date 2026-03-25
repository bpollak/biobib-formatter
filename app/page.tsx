'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UploadZone from '@/components/UploadZone';
import ProcessingView from '@/components/ProcessingView';

type DocumentType = 'dissertation' | 'thesis';
type DegreeType = 'doctoral' | 'masters';

type ProcessingStep = {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
};

const STEPS: ProcessingStep[] = [
  { label: 'Uploading document...', status: 'pending' },
  { label: 'Parsing document structure...', status: 'pending' },
  { label: 'Checking margins...', status: 'pending' },
  { label: 'Checking fonts & typography...', status: 'pending' },
  { label: 'Checking pagination...', status: 'pending' },
  { label: 'Checking page order...', status: 'pending' },
  { label: 'Checking title page...', status: 'pending' },
  { label: 'Checking abstract...', status: 'pending' },
  { label: 'Checking spacing & indentation...', status: 'pending' },
  { label: 'Checking figures & tables...', status: 'pending' },
  { label: 'Checking references...', status: 'pending' },
  { label: 'Applying auto-fixes...', status: 'pending' },
  { label: 'Generating compliance report...', status: 'pending' },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Upload',
    description: 'Upload your dissertation or thesis as a .docx file. No account required.',
  },
  {
    step: 2,
    title: 'Review',
    description: 'Our system checks 60+ GEPA formatting rules and auto-corrects what it can — margins, fonts, spacing, pagination, and more.',
  },
  {
    step: 3,
    title: 'Download',
    description: 'Get your corrected document plus a detailed compliance report showing every rule checked.',
  },
];



export default function HomePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('dissertation');
  const [degreeType, setDegreeType] = useState<DegreeType>('doctoral');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [steps, setSteps] = useState<ProcessingStep[]>(STEPS.map(s => ({ ...s })));
  const [error, setError] = useState<string | null>(null);

  function advanceStep(index: number) {
    setSteps(prev =>
      prev.map((s, i) => {
        if (i < index) return { ...s, status: 'done' };
        if (i === index) return { ...s, status: 'active' };
        return { ...s, status: 'pending' };
      })
    );
  }

  async function handleSubmit() {
    if (!file) return;
    setError(null);
    setProcessing(true);
    setProgress(5);
    setStage('Uploading...');
    advanceStep(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('degreeType', degreeType);

      setProgress(15);
      advanceStep(1);
      setStage('Parsing document structure...');

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { sessionId } = await uploadRes.json();

      for (let i = 2; i <= 10; i++) {
        await new Promise(r => setTimeout(r, 200));
        advanceStep(i);
        setProgress(15 + (i * 4));
        setStage(STEPS[i]?.label || 'Checking...');
      }

      advanceStep(11);
      setStage('Applying auto-fixes...');
      setProgress(75);

      const validateRes = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!validateRes.ok) {
        const err = await validateRes.json();
        throw new Error(err.error || 'Validation failed');
      }
      const { results } = await validateRes.json();

      advanceStep(12);
      setStage('Generating compliance report...');
      setProgress(95);

      await new Promise(r => setTimeout(r, 400));

      setProgress(100);
      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));

      sessionStorage.setItem(`results_${sessionId}`, JSON.stringify(results));
      router.push(`/results?sessionId=${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProcessing(false);
      setSteps(STEPS.map(s => ({ ...s })));
      setProgress(0);
      setStage('');
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Box component="main" sx={{ flex: 1 }}>
        <Container sx={{ py: 5, maxWidth: '1170px !important' }}>
          {processing ? (
            <ProcessingView progress={progress} stage={stage} steps={steps} />
          ) : (
            <>
              {/* ── Page Title ── */}
              <Box sx={{ mb: 5 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#182B49', mb: 1 }}>
                  Check Your Dissertation Formatting
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 650 }}>
                  Upload your .docx file to automatically validate UCSD GEPA formatting requirements.
                  We&apos;ll identify issues and apply auto-corrections where possible.
                </Typography>
              </Box>

              {/* ── How It Works ── */}
              <Box id="how-it-works" sx={{ mb: 5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#182B49', mb: 3 }}>
                  How It Works
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                    gap: 3,
                  }}
                >
                  {HOW_IT_WORKS.map(({ step, title, description }) => (
                    <Paper
                      key={step}
                      elevation={0}
                      sx={{
                        p: 3,
                        border: '1px solid #E0E7EF',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                      }}
                    >
                      {/* Numbered circle */}
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          backgroundColor: '#00629b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Typography
                          sx={{ color: '#fff', fontWeight: 700, fontSize: 18, lineHeight: 1 }}
                        >
                          {step}
                        </Typography>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#182B49' }}>
                        {title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>

              {/* ── Upload Form ── */}
              {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <Paper elevation={2} sx={{ p: 4, mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#182B49', mb: 3 }}>
                  Document Details
                </Typography>

                <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#555' }}>
                      Document Type
                    </Typography>
                    <ToggleButtonGroup
                      value={documentType}
                      exclusive
                      onChange={(_, val) => val && setDocumentType(val)}
                      size="small"
                    >
                      <ToggleButton value="dissertation" sx={{ px: 2 }}>
                        Dissertation
                      </ToggleButton>
                      <ToggleButton value="thesis" sx={{ px: 2 }}>
                        Thesis
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#555' }}>
                      Degree Type
                    </Typography>
                    <ToggleButtonGroup
                      value={degreeType}
                      exclusive
                      onChange={(_, val) => val && setDegreeType(val)}
                      size="small"
                    >
                      <ToggleButton value="doctoral" sx={{ px: 2 }}>
                        Doctoral
                      </ToggleButton>
                      <ToggleButton value="masters" sx={{ px: 2 }}>
                        Master&apos;s
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Box>

                <Divider sx={{ mb: 3 }} />

                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: '#555' }}>
                  Upload Document
                </Typography>
                <UploadZone onFileSelected={setFile} selectedFile={file} />
              </Paper>

              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={!file}
                  onClick={handleSubmit}
                  sx={{
                    px: 6,
                    py: 1.5,
                    backgroundColor: '#182B49',
                    '&:hover': { backgroundColor: '#1e3a6e' },
                    '&:disabled': { backgroundColor: '#B0BEC5' },
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Check Formatting
                </Button>
                {!file && (
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                    Upload a .docx file to continue
                  </Typography>
                )}
              </Box>

              <Box sx={{ mb: 5, p: 2, backgroundColor: '#F5F7FA', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                  📋 Checks 60+ UCSD GEPA formatting rules including margins, fonts, pagination, spacing, and more.
                  Auto-fixes ~20 rules. Generates a compliance report PDF.
                </Typography>
              </Box>


            </>
          )}
        </Container>
      </Box>

      <Footer />
    </Box>
  );
}
