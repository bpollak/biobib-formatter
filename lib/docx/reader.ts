import JSZip from 'jszip';

export interface DocxFiles {
  documentXml: string;
  stylesXml: string;
  numberingXml: string;
  contentTypesXml: string;
  settingsXml: string;
  footerXmls: string[];
}

/**
 * Extract raw XML files from a .docx buffer
 */
export async function readDocxFiles(buffer: Buffer): Promise<DocxFiles> {
  const zip = await JSZip.loadAsync(buffer);

  const documentXml = await extractFile(zip, 'word/document.xml');
  const stylesXml = await extractFile(zip, 'word/styles.xml');
  const numberingXml = await extractFile(zip, 'word/numbering.xml');
  const contentTypesXml = await extractFile(zip, '[Content_Types].xml');
  const settingsXml = await extractFile(zip, 'word/settings.xml');

  // Extract all footer files
  const footerXmls: string[] = [];
  for (const [path] of Object.entries(zip.files)) {
    if (/^word\/footer\d+\.xml$/i.test(path)) {
      const content = await extractFile(zip, path);
      if (content) footerXmls.push(content);
    }
  }

  return { documentXml, stylesXml, numberingXml, contentTypesXml, settingsXml, footerXmls };
}

async function extractFile(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) return '';
  return file.async('string');
}

/**
 * Parse page margins from document.xml sectPr
 */
export function parseMargins(documentXml: string): Array<{
  top: number; bottom: number; left: number; right: number; header: number; footer: number;
}> {
  const results: Array<{
    top: number; bottom: number; left: number; right: number; header: number; footer: number;
  }> = [];

  // Match all sectPr elements
  const sectPrRegex = /<w:sectPr[^>]*>([\s\S]*?)<\/w:sectPr>/g;
  let sectMatch;
  while ((sectMatch = sectPrRegex.exec(documentXml)) !== null) {
    const sectContent = sectMatch[1];
    const pgMarMatch = /<w:pgMar[^/]*\/>|<w:pgMar[^>]*>/g.exec(sectContent);
    if (pgMarMatch) {
      const pgMarStr = pgMarMatch[0];
      results.push({
        top: parseInt(getAttr(pgMarStr, 'w:top') || '1440'),
        bottom: parseInt(getAttr(pgMarStr, 'w:bottom') || '1440'),
        left: parseInt(getAttr(pgMarStr, 'w:left') || '1440'),
        right: parseInt(getAttr(pgMarStr, 'w:right') || '1440'),
        header: parseInt(getAttr(pgMarStr, 'w:header') || '720'),
        footer: parseInt(getAttr(pgMarStr, 'w:footer') || '720'),
      });
    }
  }

  // If no sectPr margins found, return defaults
  if (results.length === 0) {
    results.push({ top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 });
  }

  return results;
}

/**
 * Extract all paragraph elements from document.xml. Handles both forms:
 *   1. self-closing <w:p/>
 *   2. open + close <w:p ...>...</w:p>
 *
 * The previous regex was /<w:p\b[^>]*\/?>(?:[\s\S]*?<\/w:p>)?/g, which
 * over-matches: for a self-closing <w:p/>, the optional `[\s\S]*?</w:p>`
 * group would greedily consume content up to the *next* paragraph's
 * </w:p>, effectively merging two paragraphs into one captured XML
 * blob. That breaks per-paragraph parsing — the merged blob's text
 * extraction picks up the next paragraph's content too.
 *
 * Alternation form below tries the self-closing case first; only when
 * that doesn't match does it fall through to the open+close form.
 */
export function extractParagraphs(documentXml: string): string[] {
  const paragraphs: string[] = [];
  const regex = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let match;
  while ((match = regex.exec(documentXml)) !== null) {
    paragraphs.push(match[0]);
  }
  return paragraphs;
}

/**
 * Extract text content from a paragraph element
 */
export function extractParagraphText(paragraphXml: string): string {
  const parts: string[] = [];
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = tRegex.exec(paragraphXml)) !== null) {
    parts.push(match[1]);
  }
  return parts.join('');
}

/**
 * Get style name from paragraph
 */
export function getParagraphStyle(paragraphXml: string): string {
  const match = /<w:pStyle\s+w:val="([^"]+)"/.exec(paragraphXml);
  return match ? match[1] : 'Normal';
}

/**
 * Get paragraph alignment
 */
export function getParagraphAlignment(paragraphXml: string): 'left' | 'center' | 'right' | 'justify' | undefined {
  const match = /<w:jc\s+w:val="([^"]+)"/.exec(paragraphXml);
  if (!match) return undefined;
  const val = match[1];
  if (val === 'center') return 'center';
  if (val === 'right') return 'right';
  if (val === 'both') return 'justify';
  return 'left';
}

/**
 * Get line spacing from paragraph
 */
export function getLineSpacing(paragraphXml: string): number | undefined {
  const spacingMatch = /<w:spacing[^>]*>/.exec(paragraphXml);
  if (!spacingMatch) return undefined;
  const spacingStr = spacingMatch[0];
  const lineVal = getAttr(spacingStr, 'w:line');
  return lineVal ? parseInt(lineVal) : undefined;
}

/**
 * Get space before/after from paragraph
 */
export function getSpacing(paragraphXml: string): { before?: number; after?: number } {
  const spacingMatch = /<w:spacing[^>]*>/.exec(paragraphXml);
  if (!spacingMatch) return {};
  const spacingStr = spacingMatch[0];
  const beforeVal = getAttr(spacingStr, 'w:before');
  const afterVal = getAttr(spacingStr, 'w:after');
  return {
    before: beforeVal !== undefined ? parseInt(beforeVal) : undefined,
    after: afterVal !== undefined ? parseInt(afterVal) : undefined,
  };
}

/**
 * Get indentation from paragraph
 */
export function getIndentation(paragraphXml: string): {
  left?: number; right?: number; firstLine?: number; hanging?: number;
} {
  const indMatch = /<w:ind[^>]*>/.exec(paragraphXml);
  if (!indMatch) return {};
  const indStr = indMatch[0];
  return {
    left: getAttrInt(indStr, 'w:left'),
    right: getAttrInt(indStr, 'w:right'),
    firstLine: getAttrInt(indStr, 'w:firstLine'),
    hanging: getAttrInt(indStr, 'w:hanging'),
  };
}

/**
 * Get font family from run properties
 */
export function getRunFonts(runXml: string): string | undefined {
  const match = /<w:rFonts[^>]*>/.exec(runXml);
  if (!match) return undefined;
  const fontsStr = match[0];
  return getAttr(fontsStr, 'w:ascii') || getAttr(fontsStr, 'w:hAnsi') || undefined;
}

/**
 * Get font size from run properties (in half-points)
 */
export function getRunFontSize(runXml: string): number | undefined {
  const match = /<w:sz\s+w:val="(\d+)"/.exec(runXml);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Get font color from run properties
 */
export function getRunColor(runXml: string): string | undefined {
  const match = /<w:color\s+w:val="([^"]+)"/.exec(runXml);
  return match ? match[1] : undefined;
}

/**
 * Check if run has italic
 */
export function isRunItalic(runXml: string): boolean {
  // Match <w:i/> or <w:i> but NOT <w:iCs/> or <w:iCs>
  return /<w:i\s*\/>/.test(runXml.replace(/<w:iCs[^>]*\/?>/g, '')) ||
         /<w:i>/.test(runXml.replace(/<w:iCs[^>]*>/g, ''));
}

/**
 * Check if run has bold
 */
export function isRunBold(runXml: string): boolean {
  // Match <w:b/> or <w:b> but NOT <w:bCs/> or <w:bCs>
  return /<w:b\s*\/>/.test(runXml.replace(/<w:bCs[^>]*\/?>/g, '')) ||
         /<w:b>/.test(runXml.replace(/<w:bCs[^>]*>/g, ''));
}

/**
 * Extract all run elements from a paragraph
 */
export function extractRuns(paragraphXml: string): string[] {
  const runs: string[] = [];
  const regex = /<w:r[ >]([\s\S]*?)<\/w:r>/g;
  let match;
  while ((match = regex.exec(paragraphXml)) !== null) {
    runs.push(match[0]);
  }
  return runs;
}

/**
 * Parse font information from styles.xml
 */
export function parseStyleFonts(stylesXml: string): Map<string, { font?: string; size?: number; color?: string }> {
  const styleMap = new Map<string, { font?: string; size?: number; color?: string }>();
  const styleRegex = /<w:style[^>]+w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let match;
  while ((match = styleRegex.exec(stylesXml)) !== null) {
    const styleId = match[1];
    const styleContent = match[2];
    const info: { font?: string; size?: number; color?: string } = {};
    
    const fontMatch = /<w:rFonts[^>]*>/.exec(styleContent);
    if (fontMatch) {
      info.font = getAttr(fontMatch[0], 'w:ascii') || getAttr(fontMatch[0], 'w:hAnsi') || undefined;
    }
    const sizeMatch = /<w:sz\s+w:val="(\d+)"/.exec(styleContent);
    if (sizeMatch) {
      info.size = parseInt(sizeMatch[1]);
    }
    const colorMatch = /<w:color\s+w:val="([^"]+)"/.exec(styleContent);
    if (colorMatch) {
      info.color = colorMatch[1];
    }
    styleMap.set(styleId, info);
  }
  return styleMap;
}

/**
 * Check if element has drawings (figures)
 */
export function hasDrawing(xml: string): boolean {
  return /<w:drawing/.test(xml);
}

/**
 * Get alt text from drawing — looks at <wp:docPr> specifically, since `descr=`
 * may also appear on other unrelated elements inside a paragraph.
 */
export function getDrawingAltText(xml: string): string | undefined {
  const docPrMatch = /<wp:docPr\b[^>]*>/.exec(xml);
  if (!docPrMatch) return undefined;
  const descr = /descr="([^"]*)"/.exec(docPrMatch[0]);
  return descr ? descr[1] : undefined;
}

/**
 * Check if a string looks like a heading style
 */
export function isHeadingStyle(styleName: string): boolean {
  return /^Heading\s*\d+$/i.test(styleName);
}

/**
 * Get heading level from style name
 */
export function getHeadingLevel(styleName: string): number | undefined {
  const match = /(\d+)/.exec(styleName);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Helper: get attribute value from XML element string. XML attribute names
 * are case-sensitive, so we don't use the /i flag.
 */
export function getAttr(xml: string, attr: string): string | undefined {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}="([^"]*)"`);
  const match = regex.exec(xml);
  return match ? match[1] : undefined;
}

function getAttrInt(xml: string, attr: string): number | undefined {
  const val = getAttr(xml, attr);
  return val !== undefined ? parseInt(val) : undefined;
}
