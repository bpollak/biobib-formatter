'use client';

import { useState, useCallback } from 'react';
import {
  Box, Container, Typography, Button, Paper, LinearProgress,
  Alert, Chip, Divider, List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { ConversionResult, BioBibGap } from '@/lib/types';

type AppState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

interface ResultState {
  sessionId: string;
  result: ConversionResult;
  fileName: string;
}

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

export default function HomePage() {
  const [state, setState] = useState<AppState>('idle');
  const [error, setError] = useState<string>('');
  const [resultState, setResultState] = useState<ResultState | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setError('Please upload a .docx file.');
      setState('error');
      return;
    }

    setState('uploading');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    setState('processing');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Conversion failed. Please try again.');
        setState('error');
        return;
      }

      setResultState({ sessionId: data.sessionId, result: data.result, fileName: file.name });
      setState('complete');
    } catch (e) {
      setError('Network error. Please try again.');
      setState('error');
    }
  }, []);

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
    window.open(`/api/download/${resultState.sessionId}/document`, '_blank');
  };

  const onReset = () => {
    setState('idle');
    setResultState(null);
    setError('');
  };

  // Count section completion
  const sectionSummary = resultState ? buildSectionSummary(resultState.result) : null;

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
          BioBib Formatter
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Upload your faculty CV (.docx) and receive a completed UCSD Academic Biography &amp; Bibliography form.
        </Typography>
      </Box>

      {/* Upload Zone */}
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

      {/* Processing */}
      {(state === 'uploading' || state === 'processing') && (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {state === 'uploading' ? 'Uploading CV...' : 'Converting to BioBib format...'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {state === 'processing' ? 'AI is mapping your CV to the BioBib structure. This takes 30–90 seconds for a full CV.' : ''}
          </Typography>
          <LinearProgress sx={{ borderRadius: 2 }} />
        </Paper>
      )}

      {/* Results */}
      {state === 'complete' && resultState && sectionSummary && (
        <Box>
          {/* Download CTA */}
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

          {/* Section status */}
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

          {/* Gap report */}
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

// ── Helper: build section summary from ConversionResult ──────────────────────

function buildSectionSummary(result: ConversionResult) {
  const s = result.sections;
  const sections = [
    { label: 'Section I — Employment History', filled: s.employment.length > 0, count: s.employment.length },
    { label: 'Section I — Education', filled: s.education.length > 0, count: s.education.length },
    { label: 'Section II — University Service', filled: s.universityService.length > 0, count: s.universityService.length },
    { label: 'Section II — Awards and Honors', filled: s.awards.length > 0, count: s.awards.length },
    { label: 'Section II — Research Support', filled: s.grants.length > 0, count: s.grants.length },
    { label: 'Section II — Teaching', filled: s.teaching.length > 0 },
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
