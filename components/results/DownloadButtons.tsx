import { Box, Button, Typography, Tooltip } from '@mui/material';
import { SaveAlt as DownloadIcon, Description as ReportIcon } from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface DownloadButtonsProps {
  sessionId: string;
}

export const DownloadButtons = ({ sessionId }: DownloadButtonsProps) => {
  const router = useRouter();
  
  const handleDownload = async (type: 'document' | 'report') => {
    try {
      const response = await fetch(`/api/download/${sessionId}/${type}`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download ${type}`);
      }
      
      // The browser will handle the download automatically via Content-Disposition
      // We just need to make the request
    } catch (error) {
      console.error(`Download ${type} error:`, error);
      alert(`Failed to download ${type}. Please try again.`);
    }
  };
  
  return (
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
      <Tooltip title="Download Corrected Document">
        <Button 
          variant="contained"
          color="primary"
          size="large"
          sx={{ px: 4, py: 2 }}
          startIcon={<DownloadIcon fontSize="inherit" />}
          onClick={() => handleDownload('document')}
        >
          Download Corrected Document
        </Button>
      </Tooltip>
      
      <Tooltip title="Download Compliance Report">
        <Button 
          variant="contained"
          color="secondary"
          size="large"
          sx={{ px: 4, py: 2 }}
          startIcon={<ReportIcon fontSize="inherit" />}
          onClick={() => handleDownload('report')}
        >
          Download Compliance Report
        </Button>
      </Tooltip>
      
      <Box sx={{ mt: 2 }}>
        <Button 
          variant="outlined"
          size="medium"
          onClick={() => router.push('/')}
        >
          Upload Another Document
        </Button>
      </Box>
    </Box>
  );
};