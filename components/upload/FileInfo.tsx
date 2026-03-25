import { Box, Typography } from '@mui/material';

interface FileInfoProps {
  fileName: string | null;
  fileSize: number | null;
}

export const FileInfo = ({ fileName, fileSize }: FileInfoProps) => {
  if (!fileName) return null;

  const sizeInMB = fileSize ? (fileSize / (1024 * 1024)).toFixed(2) : '0.00';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
      <Typography variant="body2" sx={{ flexGrow: 1 }}>
        {fileName}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        ({sizeInMB} MB)
      </Typography>
    </Box>
  );
};