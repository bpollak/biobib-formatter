'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Container, Typography, Button, Paper, LinearProgress,
  Alert, Chip, List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails, Stack, Divider,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DescriptionIcon from '@mui/icons-material/Description';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ArticleIcon from '@mui/icons-material/Article';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { upload } from '@vercel/blob/client';
import { ConversionResult } from '@/lib/types';
import { ACCEPTED_MIME_TYPES } from '@/lib/constants';
import { SLICE_KEYS, SLICE_LABELS, type SliceKey } from '@/lib/pipeline/slices';

type AppState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
type SliceState = 'pending' | 'done' | 'failed';

interface JobStatusResponse {
  state: 'pending' | 'merging' | 'complete' | 'failed' | 'failed_partial';
  slices: Record<SliceKey, SliceState>;
  result?: ConversionResult;
  error?: string;
  startedAt: number;
  aiModel?: string;
}

interface ResultState {
  jobId: string;
  result: ConversionResult;
  fileName: string;
  partial: boolean;
}

interface ActiveJobRecord {
  jobId: string;
  fileName: string;
  startedAt: number;
}

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

// Earliest selectable cutoff for the Section II review period.
const REVIEW_PERIOD_FIRST_YEAR = 2000;
const REVIEW_PERIOD_YEARS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current; year >= REVIEW_PERIOD_FIRST_YEAR; year -= 1) years.push(year);
  return years;
})();

const POLL_INTERVAL_MS = 3000;
const PAGE_MAX_WIDTH = 1170;
const ACTIVE_JOB_STORAGE_KEY = 'biobib.activeJob.v1';
const JOB_ID_QUERY_PARAM = 'jobId';

const HOME_FEATURES = [
  {
    icon: <DescriptionIcon fontSize="small" />,
    title: 'Starts from a Word CV',
    body: 'Upload a .docx CV and the app reads the text into a BioBib draft workflow.',
  },
  {
    icon: <TaskAltIcon fontSize="small" />,
    title: 'Tracks each section',
    body: 'Long CVs are split into smaller review parts so you can see what has finished.',
  },
  {
    icon: <FactCheckIcon fontSize="small" />,
    title: 'Flags review items',
    body: 'The final result includes notes for items that still need human confirmation.',
  },
];

function readActiveJob(): ActiveJobRecord | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveJobRecord>;
    if (!parsed.jobId || !parsed.fileName || !parsed.startedAt) return null;
    return {
      jobId: parsed.jobId,
      fileName: parsed.fileName,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

function writeActiveJob(record: ActiveJobRecord): void {
  window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, JSON.stringify(record));
}

function clearActiveJob(): void {
  window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
}

function setJobIdInUrl(jobId: string | null): void {
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set(JOB_ID_QUERY_PARAM, jobId);
  else url.searchParams.delete(JOB_ID_QUERY_PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function jobIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(JOB_ID_QUERY_PARAM);
}

function recoveryUrlForJob(jobId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(JOB_ID_QUERY_PARAM, jobId);
  return url.toString();
}

export default function HomePage() {
  const [state, setState] = useState<AppState>('idle');
  const [error, setError] = useState<string>('');
  const [resultState, setResultState] = useState<ResultState | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJobRecord | null>(null);
  const [savedJob, setSavedJob] = useState<ActiveJobRecord | null>(null);
  const [resumedJob, setResumedJob] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [slices, setSlices] = useState<Record<SliceKey, SliceState>>(initialSlices);
  // 0 = all years. A real sentinel (not '') so the Select renders the
  // "All years" choice instead of showing an empty box.
  const [sinceYear, setSinceYear] = useState<number>(0);
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

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback((job: ActiveJobRecord) => {
    stopPolling();
    setActiveJob(job);
    writeActiveJob(job);
    setJobIdInUrl(job.jobId);

    const tick = async () => {
      let res: Response;
      try {
        res = await fetch(`/api/status/${job.jobId}`, { cache: 'no-store' });
      } catch {
        // Network blip — retry on next tick.
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      if (!res.ok) {
        // 404 right after upload can happen briefly while the manifest write
        // propagates. Retry within the first 10s, error out after that.
        const elapsedMs = Date.now() - job.startedAt;
        if (res.status === 404 && elapsedMs < 10_000) {
          pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        const detail = await res.json().then(b => (b as { detail?: string; error?: string }).detail ?? (b as { error?: string }).error).catch(() => null);
        if (res.status === 404) {
          clearActiveJob();
          setActiveJob(null);
          setSavedJob(null);
          setJobIdInUrl(null);
        }
        setError(`Status check failed (${res.status})${detail ? `: ${detail}` : ''}`);
        setState('error');
        return;
      }

      const status = (await res.json()) as JobStatusResponse;
      setSlices(status.slices);
      const serverStartedAt = status.startedAt || job.startedAt;
      const updatedJob = { ...job, startedAt: serverStartedAt };
      if (serverStartedAt !== job.startedAt) {
        writeActiveJob(updatedJob);
        setActiveJob(updatedJob);
      }

      if (status.state === 'pending' || status.state === 'merging') {
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      if (status.state === 'failed') {
        setError(status.error || 'Conversion failed. Please try again.');
        clearActiveJob();
        setActiveJob(null);
        setSavedJob(null);
        setJobIdInUrl(null);
        setState('error');
        return;
      }

      // complete or failed_partial — both have a usable result + download.
      if (!status.result) {
        pollTimerRef.current = window.setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      setResultState({
        jobId: job.jobId,
        result: status.result,
        fileName: job.fileName,
        partial: status.state === 'failed_partial',
      });
      setState('complete');
    };

    pollTimerRef.current = window.setTimeout(tick, 500); // first tick fast
  }, [stopPolling]);

  useEffect(() => {
    const resumeTimer = window.setTimeout(() => {
      const urlJobId = jobIdFromUrl();
      const storedJob = readActiveJob();

      if (!urlJobId) {
        setSavedJob(storedJob);
        return;
      }

      const jobToResume = {
        jobId: urlJobId,
        fileName: storedJob?.jobId === urlJobId ? storedJob.fileName : 'BioBib conversion',
        startedAt: storedJob?.jobId === urlJobId ? storedJob.startedAt : Date.now(),
      };

      setState('processing');
      setError('');
      setSavedJob(null);
      setResumedJob(true);
      setRecoveryCopied(false);
      setSlices(initialSlices());
      startPolling(jobToResume);
    }, 0);

    return () => window.clearTimeout(resumeTimer);
  }, [startPolling]);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Please upload a .docx file.');
      setState('error');
      return;
    }

    setState('uploading');
    setError('');
    setResultState(null);
    setActiveJob(null);
    setSavedJob(null);
    clearActiveJob();
    setResumedJob(false);
    setRecoveryCopied(false);
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
        body: JSON.stringify({
          blobUrl: blob.url,
          fileName: file.name,
          sinceYear: sinceYear > 0 ? sinceYear : undefined,
        }),
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

    startPolling({
      jobId: data.jobId,
      fileName: file.name,
      startedAt: Date.now(),
    });
  }, [startPolling, sinceYear]);

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

  const onResumeSavedJob = () => {
    if (!savedJob) return;
    setState('processing');
    setError('');
    setSavedJob(null);
    setResumedJob(true);
    setRecoveryCopied(false);
    setSlices(initialSlices());
    startPolling(savedJob);
  };

  const onClearSavedJob = () => {
    clearActiveJob();
    setJobIdInUrl(null);
    setSavedJob(null);
    setResumedJob(false);
    setRecoveryCopied(false);
  };

  const onCopyRecoveryLink = async () => {
    if (!activeJob) return;
    const url = recoveryUrlForJob(activeJob.jobId);
    try {
      await navigator.clipboard.writeText(url);
      setRecoveryCopied(true);
    } catch {
      window.prompt('Copy recovery link', url);
    }
  };

  const onReset = () => {
    stopPolling();
    clearActiveJob();
    setJobIdInUrl(null);
    setState('idle');
    setActiveJob(null);
    setSavedJob(null);
    setResumedJob(false);
    setRecoveryCopied(false);
    setResultState(null);
    setError('');
    setSlices(initialSlices());
  };

  const sectionSummary = resultState ? buildSectionSummary(resultState.result) : null;
  const completedSlices = SLICE_KEYS.filter((k) => slices[k] === 'done').length;
  const failedSlices = SLICE_KEYS.filter((k) => slices[k] === 'failed').length;
  const progressValue = Math.round(((completedSlices + failedSlices) / SLICE_KEYS.length) * 100);

  return (
    <Container maxWidth={false} sx={{ maxWidth: PAGE_MAX_WIDTH, py: { xs: 4, md: 6 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.35fr) minmax(300px, 0.65fr)' },
          gap: { xs: 3, md: 4 },
          alignItems: 'start',
          mb: 4,
        }}
      >
        <Box>
          <Typography
            variant="h1"
            sx={{
              color: '#182B49',
              fontSize: { xs: '2.6rem', md: '3.8rem' },
              lineHeight: 0.95,
              mb: 1.5,
            }}
          >
            Turn a faculty CV into a BioBib
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mb: 2 }}>
            Upload a Word CV and receive a downloadable UCSD Academic Biography and
            Bibliography document with section summaries and review notes.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip icon={<DescriptionIcon />} label=".docx input" size="small" />
            <Chip icon={<TaskAltIcon />} label="20 review parts" color="primary" size="small" />
            <Chip icon={<ArticleIcon />} label="BioBib .docx output" color="success" size="small" />
          </Box>
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: 3,
            borderColor: '#D7DEE8',
            backgroundColor: '#F8FAFC',
          }}
        >
          <Typography variant="h6" fontWeight={700} sx={{ color: '#182B49', mb: 2 }}>
            What the app does
          </Typography>
          <Stack spacing={2.25}>
            {HOME_FEATURES.map((item) => (
              <Box key={item.title} sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#00629B',
                    backgroundColor: '#EAF3F9',
                    flex: '0 0 auto',
                  }}
                >
                  {item.icon}
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#182B49' }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.body}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>

      {state === 'idle' && savedJob && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={onResumeSavedJob}>
                Resume
              </Button>
              <Button color="inherit" size="small" onClick={onClearSavedJob}>
                Dismiss
              </Button>
            </Stack>
          }
        >
          Saved conversion for {savedJob.fileName}. Resume it from the recovery link or dismiss it to start over.
        </Alert>
      )}

      {(state === 'idle' || state === 'error') && (
        <>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel id="review-period-label">Activity history to include</InputLabel>
            <Select<number>
              labelId="review-period-label"
              label="Activity history to include"
              value={sinceYear}
              onChange={(e) => setSinceYear(Number(e.target.value))}
            >
              <MenuItem value={0}>All years</MenuItem>
              {REVIEW_PERIOD_YEARS.map((year) => (
                <MenuItem key={year} value={year}>{`Since ${year}`}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
            Limits Section II content (service, grants, presentations, and other activities) to the
            selected period. Employment, education, and the bibliography always include all years.
          </Typography>
        </Box>
        <Paper
          variant="outlined"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          sx={{
            p: { xs: 3, sm: 5 },
            textAlign: 'center',
            cursor: 'pointer',
            border: dragOver ? '2px dashed #182B49' : '2px dashed #ccc',
            bgcolor: dragOver ? '#f0f4fa' : 'background.paper',
            transition: 'all 0.2s',
            minHeight: 300,
            display: 'grid',
            placeItems: 'center',
            boxShadow: dragOver ? '0 10px 30px rgba(24, 43, 73, 0.12)' : 'none',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <Box>
            <Box
              sx={{
                width: 78,
                height: 78,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                mx: 'auto',
                mb: 2,
                color: '#00629B',
                backgroundColor: '#EAF3F9',
              }}
            >
              <UploadFileIcon sx={{ fontSize: 42 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
              Drop your CV here
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              or browse for a Word document. Accepted format: .docx
            </Typography>
            <input id="file-input" type="file" accept=".docx" hidden onChange={onFileChange} />
            <Button
              variant="contained"
              startIcon={<UploadFileIcon />}
              onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}
            >
              Choose File
            </Button>
          </Box>
        </Paper>
        </>
      )}

      {state === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      )}

      {(state === 'uploading' || state === 'processing') && (
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box>
              <Typography variant="h5" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
                {state === 'uploading' ? 'Uploading CV' : 'Building your BioBib draft'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {state === 'processing'
                  ? 'The app is reviewing the CV in smaller parts. Large CVs can take a few minutes.'
                  : 'The Word document is being uploaded before conversion begins.'}
              </Typography>
            </Box>
            {state === 'processing' && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'start', flexWrap: 'wrap' }}>
                <Chip label={`${completedSlices}/${SLICE_KEYS.length} complete`} color="success" size="small" />
                {failedSlices > 0 && <Chip label={`${failedSlices} failed`} color="error" size="small" />}
              </Stack>
            )}
          </Box>
          {state === 'processing' && activeJob && (
            <Alert
              severity={resumedJob ? 'info' : 'success'}
              sx={{ mb: 3 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={onCopyRecoveryLink}
                >
                  {recoveryCopied ? 'Copied' : 'Copy Link'}
                </Button>
              }
            >
              {resumedJob
                ? `Resumed ${activeJob.fileName}. The recovery link in the address bar can reopen this job.`
                : `Saved ${activeJob.fileName}. The recovery link in the address bar can reopen this job if the page is refreshed or closed.`}
            </Alert>
          )}
          <LinearProgress
            variant={state === 'processing' ? 'determinate' : 'indeterminate'}
            value={state === 'processing' ? progressValue : undefined}
            sx={{ height: 8, borderRadius: 999, mb: 3 }}
          />
          {state === 'processing' && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
            >
              {SLICE_KEYS.map((k) => (
                <Box
                  key={k}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.25,
                    border: '1px solid #E2E8F0',
                    borderRadius: 1,
                    backgroundColor: slices[k] === 'pending' ? '#FFFFFF' : '#F8FAFC',
                    minHeight: 48,
                  }}
                >
                  {slices[k] === 'done' && <CheckCircleIcon color="success" fontSize="small" />}
                  {slices[k] === 'failed' && <ErrorIcon color="error" fontSize="small" />}
                  {slices[k] === 'pending' && <HourglassEmptyIcon color="action" fontSize="small" />}
                  <Typography variant="body2" color={slices[k] === 'pending' ? 'text.secondary' : 'text.primary'}>
                    {SLICE_LABELS[k]}
                  </Typography>
                </Box>
              ))}
            </Box>
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

          <Paper sx={{ p: { xs: 3, sm: 4 }, mb: 3, bgcolor: 'primary.main', color: 'white' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="h5" fontWeight={700}>BioBib draft is ready</Typography>
                <Typography variant="body2" sx={{ opacity: 0.85 }}>
                  {sectionSummary.autoFilled} sections completed automatically · {sectionSummary.gaps.required} required gaps
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
                  This result remains recoverable from this browser until you start over.
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

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 0.9fr) minmax(280px, 0.45fr)' },
              gap: 3,
              mb: 3,
            }}
          >
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={700} sx={{ color: '#182B49' }}>
                Section completion
              </Typography>
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

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={700} sx={{ color: '#182B49' }}>
                Review summary
              </Typography>
              <Stack divider={<Divider flexItem />} spacing={1.75}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Required</Typography>
                  <Typography variant="h5" fontWeight={700}>{sectionSummary.gaps.required}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Recommended</Typography>
                  <Typography variant="h5" fontWeight={700}>{sectionSummary.gaps.recommended}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Optional</Typography>
                  <Typography variant="h5" fontWeight={700}>{sectionSummary.gaps.optional}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Review notes</Typography>
                  <Typography variant="h5" fontWeight={700}>{sectionSummary.reviewNotes}</Typography>
                </Box>
              </Stack>
            </Paper>
          </Box>

          {resultState.result.gaps.length > 0 && (
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={700} sx={{ color: '#182B49' }}>
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

          {resultState.result.reviewNotes && resultState.result.reviewNotes.length > 0 && (
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom fontWeight={700} sx={{ color: '#182B49' }}>
                Review Notes
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These items may be valid as drafted, but should be checked for section placement or duplication.
              </Typography>
              <List dense>
                {resultState.result.reviewNotes.map((note, i) => (
                  <ListItem key={`${note.section}-${note.topic}-${i}`} alignItems="flex-start">
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <WarningIcon color="warning" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${note.section} — ${note.topic}`}
                      secondary={note.instruction}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                      secondaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItem>
                ))}
              </List>
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
    {
      label: 'Section II — Student Instructional Activities',
      filled: (s.studentInstructionalGroups.length + s.studentInstructionalActivities.length + s.teaching.length) > 0,
      count: s.studentInstructionalGroups.reduce((total, group) => total + group.entries.length, 0) + s.studentInstructionalActivities.length,
    },
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

  return { sections, autoFilled, gaps, reviewNotes: result.reviewNotes?.length ?? 0 };
}
