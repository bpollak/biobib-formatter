import { useState } from 'react';
import { Box, Button, Typography, CircularProgress, Alert } from '@mui/material';
import { useDropzone } from 'react-dropzone';

export const UploadZone = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { getRootProps, getInputProps, isDragActive: isDragging } = useDropzone({
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    maxSize: 50 * 1024 * 1024, // 50MB
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      setFileName(file.name);
      // The actual form submission will happen via the parent form
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
  });

  const handleClick = () => {
    document.getElementById('file-input')?.click();
  };

  return (
    <Box
      sx={{
        border: 2,
        borderStyle: isDragging ? 'dashed' : 'solid',
        borderColor: isDragging ? 'primary.main' : 'divider',
        borderRadius: 2,
        p: 6,
        textAlign: 'center',
        backgroundColor: isDragging ? 'action.hover' : 'background.paper',
        transition: 'all 0.2s ease-in-out',
      }}
      {...getRootProps()}
    >
      <input
        id="file-input"
        type="file"
        accept=".docx"
        style={{ display: 'none' }}
        {...getInputProps()}
      />
      
      {isProcessing && (
        <>
          <CircularProgress size={48} sx={{ mb: 3 }} />
          <Typography variant="body2" sx={{ mb: 2 }}>
            Processing your document...
          </Typography>
        </>
      )}
      
      {!isProcessing && (
        <>
          {!isDragging && fileName ? (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Selected: {fileName}
              </Typography>
              <Button 
                variant="contained"
                color="secondary"
                sx={{ mt: 2 }}
                onClick={handleClick}
              >
                Change File
              </Button>
            </>
          ) : (
            <>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Drag & drop your .docx file here, or click to select
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
                Maximum file size: 50MB
              </Typography>
              <Button 
                variant="contained"
                color="primary"
                sx={{ mt: 2 }}
                onClick={handleClick}
              >
                Select File
              </Button>
            </>
          )}
          
          {isDragging && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="body2" color="success.main">
                Release to upload
              </Typography>
            </Box>
          )}
        </>
      )}
      
      <Box sx={{ mt: 4, textAlign: 'left' }}>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
          Supported Format:
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          • Microsoft Word (.docx) only
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
          Requirements:
        </Typography>
        <Typography variant="body2">
          • Minimum 1" margins on all sides
          • Approved fonts: Arial, Century Gothic, Helvetica, Times New Roman
          • Font size: 10pt, 11pt, or 12pt
          • Double-spaced body text
          • 0.5" first-line indent
          • Page numbers centered at bottom, 0.5" from edge
          • And 40+ more formatting rules...
        </Typography>
      </Box>
    </Box>
  );
};