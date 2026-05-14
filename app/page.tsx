'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Button, Paper, LinearProgress,
  Alert, Chip, List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, Stack,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { upload } from '@vercel/blob/client';
import { ConversionResult } from '@/lib/types';
import { ACCEPTED_MIME_TYPES } from '@/lib/constants';

type AppState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
type SliceKey =
  | 'meta_and_I'
  | 'II_service'
  | 'II_teaching_grants'
  | 'II_other'
  | 'III_journals_early'
  | 'III_journals_late'
  | 'III_other_a'
  | 'III_other_proc'
  | 'III_abstracts_early'
  | 'III_abstracts_late'
  | 'III_popular_products';
type SliceState = 'pending' | 'done' | 'failed';

interface JobStatusResponse {
  state: 'pending' | 'merging' | 'complete' | 'failed' | 'failed_partial';
  slices: Record<SliceKey, SliceState>;
  result?: ConversionResult;
  error?: string;
  startedAt: number;
}

interface ResultState {
  jobId: string;
  result: ConversionResult;
  fileName: string;
  partial: boolean;
}

const SLICE_LABELS: Record<SliceKey, string> = {
  meta_and_I: 'Section I — Employment & Education',
  II_service: 'Section II — Service, Memberships, Awards',
  II_teaching_grants: 'Section II — Teaching & Research Support',
  II_other: 'Section II — External Activities & Reviews',
  III_journals_early: `Section III — Peer-Reviewed Journals (≤ 2010)`,
  III_journals_late: 'Section III — Peer-Reviewed Journals (> 2010)',
  III_other_a: 'Section III — Books, Chapters, Reviews',
  III_other_proc: 'Section III — Conference Proceedings',
  III_abstracts_early: `Section III — Abstracts (≤ 2010)`,
  III_abstracts_late: 'Section III — Abstracts (> 2010)',
  III_popular_products: 'Section III — Popular Works & Products',
};

const SLICE_KEYS = Object.keys(SLICE_LABELS) as SliceKey[];

const initialSlices = (): Record<SliceKey, SliceState> =>
  SLICE_KEYS.reduce((acc, key) => {
    acc[key] = 'pending';
    return acc;
  }, {} as Record<SliceKey, SliceState>);

const SEVERITY_COLOR = {
  required: 'error' as const,
  recommended: 'warning' as const,
  optional: 'info' as const,
};

const SEVERITY_ICON = {
  required: <ErrorIcon color="error" />,
  recommended: <WarningIcon color="warning" />,
  optional: <CheckCircleIcon color="info" />,
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 12 * 60 * 1000; // Pro slice budget + finalize headroom

export default function HomePage() {
  const [state, setState] = useState<AppState>('idle');
  const [error, setError] = useState<string>('');
  const [resultState, setResultState] = useState<ResultState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [slices, setSlices] = useState<Record<SliceKey, SliceState>>(initialSlices);
  const pollTimerRef = useRef<number | null>(null);

  // Clean up the polling timer on unmount or state reset.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = useCallback((jobId: string, fileName: string) => {
    const startedAt = Date.now();

    const tick = async () => {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > POLL_TIMEOUT_MS) {
        setError('Conversion timed out after 12 minutes. Please try again.');
        setState('error');
        return;
      }

      let res: Response;
      try {
        res = await fetch(`/api/status/${jobId}`, { cache: 'no-store' });
      } catch {
        // Network blip — retry on next tick.
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      if (!res.ok) {
        // 404 right after upload can happen briefly while the manifest write
        // propagates. Retry within the first 10s, error out after that.
        if (res.status === 404 && elapsedMs < 10_000) {
          pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        const detail = await res.json().then(b => (b as { detail?: string; error?: string }).detail ?? (b as { error?: string }).error).catch(() => null);
        setError(`Status check failed (${res.status})${detail ? `: ${detail}` : ''}`);
        setState('error');
        return;
      }

      const status = (await res.json()) as JobStatusResponse;
      setSlices(status.slices);

      if (status.state === 'pending' || status.state === 'merging') {
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      if (status.state === 'failed') {
        setError(status.error || 'Conversion failed. Please try again.');
        setState('error');
        return;
      }

      // complete or failed_partial — both have a usable result + download.
      if (!status.result) {
        setError('Conversion finished but no result was produced.');
        setState('error');
        return;
      }

      setResultState({
        jobId,
        result: status.result,
        fileName,
        partial: status.state === 'failed_partial',
      });
      setState('complete');
    };

    pollTimerRef.current = window.setTimeout(tick, 500); // first tick fast
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setError('Please upload a .docx file.');
      setState('error');
      return;
    }

    setState('uploading');
    setError('');
    setSlices(initialSlices());

    let blob;
    try {
      blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-token',
        contentType: ACCEPTED_MIME_TYPES[0],
      });
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message || 'please try again.'}`);
      setState('error');
      return;
    }

    setState('processing');

    let res: Response;
    try {
      res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url, fileName: file.name }),
      });
    } catch (e) {
      setError(`Network error: ${(e as Error).message || 'please try again.'}`);
      setState('error');
      return;
    }

    const rawBody = await res.text();
    let data: { jobId?: string; error?: string };
    try {
      data = JSON.parse(rawBody);
    } catch {
      setError(`Server returned ${res.status} ${res.statusText || ''}`.trim() + '. Please try again.');
      setState('error');
      return;
    }

    if (!res.ok) {
      setError(data.error || `Server error ${res.status}. Please try again.`);
      setState('error');
      return;
    }

    if (!data.jobId) {
      setError('Server returned no jobId.');
      setState('error');
      return;
    }

    startPolling(data.jobId, file.name);
  }, [startPolling]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onDownload = () => {
    if (!resultState) return;
    window.open(`/api/download/${resultState.jobId}`, '_blank');
  };

  const onReset = () => {
    stopPolling();
    setState('idle');
    setResultState(null);
    setError('');
    setSlices(initialSlices());
  };

  const sectionSummary = resultState ? buildSectionSummary(resultState.result) : null;

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
          BioBib Formatter
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Upload your faculty CV (.docx) and receive a completed UCSD Academic Biography &amp; Bibliography form.
        </Typography>
      </Box>

      {(state === 'idle' || state === 'error') && (
        <Paper
          variant="outlined"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          sx={{
            p: 6, textAlign: 'center', cursor: 'pointer',
            border: dragOver ? '2px dashed #182B49' : '2px dashed #ccc',
            bgcolor: dragOver ? '#f0f4fa' : 'background.paper',
            transition: 'all 0.2s',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <UploadFileIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>Drop your CV here</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            or click to browse — .docx files only
          </Typography>
          <input id="file-input" type="file" accept=".docx" hidden onChange={onFileChange} />
          <Button variant="contained" sx={{ mt: 2 }} onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>
            Choose File
          </Button>
        </Paper>
      )}

      {state === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      )}

      {(state === 'uploading' || state === 'processing') && (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {state === 'uploading' ? 'Uploading CV…' : 'Converting to BioBib format…'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {state === 'processing'
              ? 'AI workers extract sections in parallel. Large CVs can take several minutes.'
              : ''}
          </Typography>
          <LinearProgress sx={{ borderRadius: 2, mb: 3 }} />
          {state === 'processing' && (
            <Stack spacing={1} sx={{ textAlign: 'left', maxWidth: 460, mx: 'auto' }}>
              {SLICE_KEYS.map((k) => (
                <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {slices[k] === 'done' && <CheckCircleIcon color="success" fontSize="small" />}
                  {slices[k] === 'failed' && <ErrorIcon color="error" fontSize="small" />}
                  {slices[k] === 'pending' && <HourglassEmptyIcon color="action" fontSize="small" />}
                  <Typography variant="body2" color={slices[k] === 'pending' ? 'text.secondary' : 'text.primary'}>
                    {SLICE_LABELS[k]}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      )}

      {state === 'complete' && resultState && sectionSummary && (
        <Box>
          {resultState.partial && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Some sections failed to convert; the BioBib has placeholders for those. You can still download and edit it.
            </Alert>
          )}

          <Paper sx={{ p: 3, mb: 3, bgcolor: 'primary.main', color: 'white' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>BioBib Generated</Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  {sectionSummary.autoFilled} sections completed automatically · {sectionSummary.gaps.required} required gaps
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={onDownload}
                sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: '#e8f0fe' } }}
              >
                Download BioBib.docx
              </Button>
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight={600}>Section Completion</Typography>
            <List dense>
              {sectionSummary.sections.map((s, i) => (
                <ListItem key={i} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {s.filled ? <CheckCircleIcon color="success" fontSize="small" /> : <WarningIcon color="warning" fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={s.label}
                    secondary={s.count !== undefined ? `${s.count} entries` : undefined}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>

          {resultState.result.gaps.length > 0 && (
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Manual Completion Required
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                The following sections need your input. Red items are required before submitting your BioBib.
              </Typography>
              {['required', 'recommended', 'optional'].map((severity) => {
                const items = resultState.result.gaps.filter(g => g.severity === severity);
                if (items.length === 0) return null;
                return (
                  <Accordion key={severity} defaultExpanded={severity === 'required'}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {SEVERITY_ICON[severity as keyof typeof SEVERITY_ICON]}
                        <Typography fontWeight={600} textTransform="capitalize">{severity}</Typography>
                        <Chip label={items.length} size="small" color={SEVERITY_COLOR[severity as keyof typeof SEVERITY_COLOR]} />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {items.map((gap, i) => (
                        <Box key={i} sx={{ mb: 2, pl: 2, borderLeft: '3px solid', borderColor: `${SEVERITY_COLOR[severity as keyof typeof SEVERITY_COLOR]}.main` }}>
                          <Typography variant="body2" fontWeight={600}>{gap.section} — {gap.field}</Typography>
                          <Typography variant="body2" color="text.secondary">{gap.instruction}</Typography>
                        </Box>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Paper>
          )}

          <Button variant="outlined" onClick={onReset}>Upload Another CV</Button>
        </Box>
      )}
    </Container>
  );
}

function buildSectionSummary(result: ConversionResult) {
  const s = result.sections;
  const sections = [
    { label: 'Section I — Employment History', filled: s.employment.length > 0, count: s.employment.length },
    { label: 'Section I — Education', filled: s.education.length > 0, count: s.education.length },
    { label: 'Section II — University Service', filled: s.universityService.length > 0, count: s.universityService.length },
    { label: 'Section II — Memberships', filled: s.memberships.length > 0, count: s.memberships.length },
    { label: 'Section II — Awards and Honors', filled: s.awards.length > 0, count: s.awards.length },
    { label: 'Section II — Research Support', filled: s.grants.length > 0, count: s.grants.length },
    { label: 'Section II — Student Instructional Activities', filled: (s.studentInstructionalActivities.length + s.teaching.length) > 0 },
    { label: 'Section II — External Professional Activities', filled: (s.professionalActivities.length + s.externalProfessionalActivities.length + s.presentations.length + s.invitedPresentations.length) > 0 },
    { label: 'Section III — Peer-Reviewed Publications', filled: s.peerReviewedJournals.length > 0, count: s.peerReviewedJournals.length },
    { label: 'Section III — Other Publications', filled: (s.reviewAndInvited.length + s.books.length + s.chapters.length) > 0 },
  ];

  const autoFilled = sections.filter(s => s.filled).length;
  const gaps = {
    required: result.gaps.filter(g => g.severity === 'required').length,
    recommended: result.gaps.filter(g => g.severity === 'recommended').length,
    optional: result.gaps.filter(g => g.severity === 'optional').length,
  };

  return { sections, autoFilled, gaps };
}
