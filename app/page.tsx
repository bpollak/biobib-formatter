'use client';

import { useRef, useState } from 'react';
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
import { upload } from '@vercel/blob/client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UploadZone from '@/components/UploadZone';
import ProcessingView from '@/components/ProcessingView';
import { MAX_FILE_SIZE_MB } from '@/lib/constants';

type DocumentType = 'dissertation' | 'thesis';
type DegreeType = 'doctoral' | 'masters';

// If the upload makes no progress for this many ms, abort and tell the user.
// Helps surface stalled uploads (poor mobile data, blocked endpoints, etc.)
// instead of leaving the spinner hanging indefinitely.
const UPLOAD_STALL_MS = 60_000;

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Upload',
    description: 'Upload your dissertation or thesis as a .docx file. No account required.',
  },
  {
    step: 2,
    title: 'Review',
    description: 'Our system checks 80+ GEPA formatting rules and auto-corrects what it can — margins, fonts, spacing, pagination, and more.',
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
  const [stage, setStage] = useState('');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleCancel() {
    abortRef.current?.abort();
  }

  async function handleSubmit() {
    if (!file) return;
    setError(null);
    setProcessing(true);
    setUploadPercent(0);

    const controller = new AbortController();
    abortRef.current = controller;

    // Stall watchdog: if no upload progress event fires for UPLOAD_STALL_MS,
    // abort. Reset on every onUploadProgress tick.
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        controller.abort(new Error('Upload stalled — no progress for 60 seconds'));
      }, UPLOAD_STALL_MS);
    };

    try {
      // 1. Upload to Vercel Blob directly from client. Real progress events,
      // an abort signal, and a stall watchdog so the UI doesn't hang silently
      // on poor connections.
      setStage('Uploading file...');
      armStallTimer();
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload',
        abortSignal: controller.signal,
        onUploadProgress: (event) => {
          armStallTimer();
          setUploadPercent(event.percentage);
          setStage(`Uploading file... ${Math.round(event.percentage)}%`);
        },
      });
      if (stallTimer) clearTimeout(stallTimer);
      setUploadPercent(null);

      // 2. Run validation + auto-fixes in a single server request. Server
      // streaming progress would be the right way to drive a real progress
      // bar for this phase; until that exists we show an indeterminate
      // spinner with a single label so users aren't misled by a fake
      // animation.
      setStage('Checking 80+ formatting rules and applying auto-fixes...');
      const checkRes = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType,
          degreeType,
          fileName: file.name,
          fileSize: file.size,
          blobUrl: blob.url,
        }),
        signal: controller.signal,
      });

      if (!checkRes.ok) {
        let errDetail = 'Processing failed';
        try {
          const err = await checkRes.json();
          errDetail = err.error || errDetail;
        } catch {
          // Graceful fallback for non-JSON responses (e.g. Vercel 413 or 504).
          const text = await checkRes.text();
          if (text.includes('Request Entity Too Large')) {
            errDetail = `File exceeds maximum upload size (${MAX_FILE_SIZE_MB}MB).`;
          } else {
            errDetail = `Server returned ${checkRes.status}: ${checkRes.statusText}`;
          }
        }
        throw new Error(errDetail);
      }

      const { results, correctedFileUrl, originalFileName } = await checkRes.json();

      const sessionId = results.sessionId;
      sessionStorage.setItem(`results_${sessionId}`, JSON.stringify(results));
      sessionStorage.setItem(`originalFileName_${sessionId}`, originalFileName);
      if (correctedFileUrl) {
        sessionStorage.setItem(`correctedFileUrl_${sessionId}`, correctedFileUrl);
      }

      setStage('Loading results...');
      router.push(`/results?sessionId=${sessionId}`);
    } catch (err) {
      if (stallTimer) clearTimeout(stallTimer);
      const message = err instanceof Error ? err.message : 'An error occurred';
      // Distinguish user-cancelled aborts from genuine errors.
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        message.includes('aborted') ||
        message.includes('stalled');
      setError(
        isAbort
          ? message.includes('stalled')
            ? 'Upload stalled. This usually means a slow or interrupted network connection — try again on a stronger connection.'
            : 'Upload cancelled.'
          : message
      );
      setProcessing(false);
      setStage('');
      setUploadPercent(null);
      abortRef.current = null;
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Box component="main" sx={{ flex: 1 }}>
        <Container sx={{ py: 5, maxWidth: '1170px !important' }}>
          {processing ? (
            <ProcessingView
              stage={stage}
              uploadPercent={uploadPercent}
              onCancel={handleCancel}
            />
          ) : (
            <>
              {/* ── Page Title ── */}
              <Box sx={{ mb: 5 }}>
                <Typography variant="h1" sx={{ color: '#182B49', mb: 1 }}>
                  Check Your Dissertation Formatting
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 650 }}>
                  Upload your .docx file to automatically validate UCSD GEPA formatting requirements.
                  We&apos;ll identify issues and apply auto-corrections where possible.
                </Typography>
              </Box>

              {/* ── How It Works ── */}
              <Box id="how-it-works" sx={{ mb: 5 }}>
                <Typography variant="h2" sx={{ color: '#182B49', mb: 3 }}>
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
                      <Typography variant="h3" sx={{ fontWeight: 700, color: '#182B49' }}>
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
                <Typography variant="h2" sx={{ color: '#182B49', mb: 3 }}>
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
                  Checks 80+ UCSD GEPA formatting rules including margins, fonts, pagination, spacing, and more.
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
