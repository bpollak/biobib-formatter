'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelected, selectedFile, disabled }: UploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelected(acceptedFiles[0]);
      }
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    disabled,
  });

  const borderColor = isDragReject
    ? '#C62828'
    : isDragActive
    ? '#C69214'
    : selectedFile
    ? '#2E7D32'
    : '#B0BEC5';

  const bgColor = isDragReject
    ? 'rgba(198, 40, 40, 0.04)'
    : isDragActive
    ? 'rgba(198, 146, 20, 0.06)'
    : selectedFile
    ? 'rgba(46, 125, 50, 0.04)'
    : 'rgba(0,0,0,0.02)';

  return (
    <Paper
      {...getRootProps()}
      elevation={0}
      sx={{
        border: `2px dashed ${borderColor}`,
        borderRadius: 2,
        p: 4,
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor: bgColor,
        transition: 'all 0.2s ease',
        textAlign: 'center',
        '&:hover': disabled ? {} : {
          borderColor: '#C69214',
          backgroundColor: 'rgba(198, 146, 20, 0.04)',
        },
      }}
    >
      <input {...getInputProps()} />

      {selectedFile ? (
        <Box>
          <Typography variant="h2" sx={{ fontSize: 40, mb: 1 }}>
            📄
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#2E7D32', mb: 0.5 }}>
            {selectedFile.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Click or drag to replace
          </Typography>
          {selectedFile.size > 40 * 1024 * 1024 && (
            <Typography variant="caption" sx={{ display: 'block', color: '#E65100', mt: 0.5, fontWeight: 600 }}>
              Large file ({(selectedFile.size / 1024 / 1024).toFixed(0)} MB) — processing may take longer
            </Typography>
          )}
        </Box>
      ) : isDragActive && !isDragReject ? (
        <Box>
          <Typography variant="h2" sx={{ fontSize: 40, mb: 1 }}>
            📥
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#C69214' }}>
            Drop your .docx file here
          </Typography>
        </Box>
      ) : isDragReject ? (
        <Box>
          <Typography variant="h2" sx={{ fontSize: 40, mb: 1 }}>
            ❌
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#C62828' }}>
            Only .docx files are accepted
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography variant="h2" sx={{ fontSize: 40, mb: 2 }}>
            📂
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 1, color: '#182B49' }}>
            Drag & drop your dissertation here
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            or click to browse files
          </Typography>
          <Button
            variant="outlined"
            size="small"
            sx={{
              borderColor: '#182B49',
              color: '#182B49',
              '&:hover': { borderColor: '#C69214', color: '#C69214' },
            }}
          >
            Browse Files
          </Button>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
            Accepts .docx files only • Maximum 50MB
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
