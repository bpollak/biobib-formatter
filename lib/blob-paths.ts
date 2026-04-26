const DOCX_EXTENSION_RE = /\.docx$/i;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/g;

export function sanitizeUserFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || 'document.docx';
  const sanitized = baseName
    .replace(CONTROL_CHAR_RE, '')
    .replace(/[\\/]+/g, '-');

  return sanitized || 'document.docx';
}

export function stripDocxExtension(fileName: string): string {
  return sanitizeUserFileName(fileName).replace(DOCX_EXTENSION_RE, '');
}

export function buildUploadPathname(fileName: string): string {
  return `uploads/${sanitizeUserFileName(fileName)}`;
}

export function buildCorrectedBlobPathname(sessionId: string, fileName: string): string {
  return `corrected/${sessionId}/${stripDocxExtension(fileName)}_corrected.docx`;
}

export function buildCorrectedDownloadFileName(fileName: string): string {
  return `${stripDocxExtension(fileName)}_corrected.docx`;
}

export function buildReportDownloadFileName(fileName: string): string {
  return `${stripDocxExtension(fileName)}_compliance_report.pdf`;
}

export function normalizeBlobPathname(pathname: string): string {
  const trimmed = pathname.trim().replace(/^\/+/, '');
  const normalized = trimmed.split(/[?#]/, 1)[0] ?? '';

  if (!normalized) {
    throw new Error('No file path provided');
  }

  if (normalized !== trimmed) {
    throw new Error('Blob path must not include query parameters or fragments');
  }

  if (normalized.includes('://')) {
    throw new Error('Blob URLs are not accepted here');
  }

  const segments = normalized.split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Invalid blob path');
  }

  return normalized;
}

export function buildAttachmentDisposition(fileName: string): string {
  const safeFileName = sanitizeUserFileName(fileName);
  const asciiFallback =
    safeFileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(safeFileName).replace(
    /['()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
