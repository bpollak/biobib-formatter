import JSZip from 'jszip';
import { ChangeRecord } from '../types';

/**
 * Load a .docx buffer and return the JSZip instance + document XML
 */
export async function loadDocx(buffer: Buffer): Promise<{ zip: JSZip; documentXml: string; stylesXml: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await (zip.file('word/document.xml')?.async('string') || Promise.resolve(''));
  const stylesXml = await (zip.file('word/styles.xml')?.async('string') || Promise.resolve(''));
  return { zip, documentXml, stylesXml };
}

/**
 * Save the modified document XML back and return as Buffer
 */
export async function saveDocx(zip: JSZip, documentXml: string, stylesXml?: string): Promise<Buffer> {
  zip.file('word/document.xml', documentXml);
  if (stylesXml) {
    zip.file('word/styles.xml', stylesXml);
  }
  const arrayBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(arrayBuffer);
}

/**
 * Set all page margins to 1" (1440 twips)
 */
export function fixMargins(
  documentXml: string,
  changes: ChangeRecord[],
  targetMargins = { top: 1440, bottom: 1440, left: 1440, right: 1440, footer: 720 }
): string {
  // Find existing pgMar and check values
  const pgMarRegex = /<w:pgMar[^/]*\/>/g;
  const newPgMar = `<w:pgMar w:top="${targetMargins.top}" w:right="${targetMargins.right}" w:bottom="${targetMargins.bottom}" w:left="${targetMargins.left}" w:header="720" w:footer="${targetMargins.footer}" w:gutter="0"/>`;
  
  let modified = false;
  const result = documentXml.replace(pgMarRegex, (match) => {
    const topVal = getXmlAttr(match, 'w:top');
    const rightVal = getXmlAttr(match, 'w:right');
    const bottomVal = getXmlAttr(match, 'w:bottom');
    const leftVal = getXmlAttr(match, 'w:left');
    const footerVal = getXmlAttr(match, 'w:footer');

    const needsFix =
      (topVal && parseInt(topVal) < targetMargins.top) ||
      (rightVal && parseInt(rightVal) < targetMargins.right) ||
      (bottomVal && parseInt(bottomVal) < targetMargins.bottom) ||
      (leftVal && parseInt(leftVal) < targetMargins.left) ||
      (footerVal && parseInt(footerVal) !== targetMargins.footer);

    if (needsFix) {
      modified = true;
      changes.push({
        ruleId: 'MARGIN-001',
        description: 'Corrected page margins to minimum 1" on all sides, footer at 0.5"',
        location: 'Document section properties',
        before: `top=${twipsToInches(parseInt(topVal || '1440'))}", bottom=${twipsToInches(parseInt(bottomVal || '1440'))}", left=${twipsToInches(parseInt(leftVal || '1440'))}", right=${twipsToInches(parseInt(rightVal || '1440'))}"`,
        after: '1" on all sides, page numbers 0.5" from bottom',
      });
      return newPgMar;
    }
    return match;
  });

  // If no pgMar found at all, we can't easily add one without full XML restructure
  return result;
}

/**
 * Fix font colors to black in all runs
 */
export function fixFontColors(documentXml: string, changes: ChangeRecord[]): string {
  let colorFixed = 0;
  
  // Replace colored w:color elements (non-black, non-auto)
  const result = documentXml.replace(/<w:color\s+w:val="([^"]+)"\s*\/>/g, (match, colorVal) => {
    if (colorVal !== '000000' && colorVal !== 'auto' && colorVal.toLowerCase() !== '000000') {
      colorFixed++;
      return `<w:color w:val="000000"/>`;
    }
    return match;
  });

  if (colorFixed > 0) {
    changes.push({
      ruleId: 'FONT-005',
      description: `Changed ${colorFixed} colored text instance(s) to black`,
      location: 'Throughout document',
      before: 'Various colors',
      after: 'Black (#000000)',
    });
  }

  return result;
}

/**
 * Fix fonts to approved list (replace unapproved fonts with Times New Roman)
 */
export function fixFonts(
  documentXml: string,
  stylesXml: string,
  approvedFonts: string[],
  defaultFont: string,
  changes: ChangeRecord[]
): { documentXml: string; stylesXml: string } {
  let fontFixed = 0;
  
  const fixFontInXml = (xml: string): string => {
    return xml.replace(/<w:rFonts([^/]*)\/?>/g, (match) => {
      let modified = false;
      let result = match;
      
      ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'].forEach(attr => {
        const fontVal = getXmlAttr(match, attr);
        if (fontVal && !approvedFonts.some(f => fontVal.toLowerCase().includes(f.toLowerCase()))) {
          result = result.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${defaultFont}"`);
          modified = true;
        }
      });
      
      if (modified) fontFixed++;
      return result;
    });
  };

  const newDocXml = fixFontInXml(documentXml);
  const newStylesXml = fixFontInXml(stylesXml);

  if (fontFixed > 0) {
    changes.push({
      ruleId: 'FONT-001',
      description: `Replaced ${fontFixed} unapproved font reference(s) with ${defaultFont}`,
      location: 'Throughout document',
      before: 'Non-approved fonts',
      after: defaultFont,
    });
  }

  return { documentXml: newDocXml, stylesXml: newStylesXml };
}

/**
 * Fix line spacing in body text to double-space
 */
export function fixBodySpacing(documentXml: string, changes: ChangeRecord[]): string {
  let spacingFixed = 0;
  
  // For each paragraph with Normal style or no style, ensure double spacing
  // This is a targeted fix - only fix body paragraphs with wrong spacing
  const result = documentXml.replace(
    /(<w:p[ >][\s\S]*?<w:pPr>)([\s\S]*?)(<\/w:pPr>)/g,
    (match, open, pPrContent, close) => {
      // Skip if it's a heading, caption, or special style
      const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPrContent);
      const styleName = styleMatch ? styleMatch[1].toLowerCase() : 'normal';
      
      if (
        styleName.includes('heading') ||
        styleName.includes('caption') ||
        styleName.includes('footnote') ||
        styleName.includes('toc') ||
        styleName.includes('list')
      ) {
        return match;
      }

      // Check current spacing
      const spacingMatch = /<w:spacing[^>]*>/.exec(pPrContent);
      if (spacingMatch) {
        const lineVal = getXmlAttr(spacingMatch[0], 'w:line');
        const lineRuleVal = getXmlAttr(spacingMatch[0], 'w:lineRule');
        if (lineVal && parseInt(lineVal) >= 480 && lineRuleVal !== 'exact') {
          return match; // Already double-spaced or more
        }
        // Fix spacing
        const newSpacing = spacingMatch[0].replace(
          /w:line="[^"]*"/,
          'w:line="480"'
        ).replace(/w:lineRule="[^"]*"/, '');
        spacingFixed++;
        return match.replace(spacingMatch[0], newSpacing);
      }
      
      return match;
    }
  );

  if (spacingFixed > 0) {
    changes.push({
      ruleId: 'SPACE-001',
      description: `Set ${spacingFixed} paragraph(s) to double-spacing`,
      location: 'Body text paragraphs',
      before: 'Single or custom spacing',
      after: 'Double-spaced (480 twips)',
    });
  }

  return result;
}

/**
 * Fix first-line indentation for body paragraphs
 */
export function fixFirstLineIndent(documentXml: string, changes: ChangeRecord[]): string {
  let indentFixed = 0;
  
  const result = documentXml.replace(
    /(<w:p[ >][\s\S]*?<w:pPr>)([\s\S]*?)(<\/w:pPr>)/g,
    (match, open, pPrContent, close) => {
      // Skip headings, captions, etc.
      const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPrContent);
      const styleName = styleMatch ? styleMatch[1].toLowerCase() : 'normal';
      
      if (
        styleName.includes('heading') ||
        styleName.includes('caption') ||
        styleName.includes('footnote') ||
        styleName.includes('toc') ||
        styleName.includes('list') ||
        styleName.includes('title')
      ) {
        return match;
      }

      // Check indentation
      const indMatch = /<w:ind[^>]*>/.exec(pPrContent);
      if (indMatch) {
        const firstLine = getXmlAttr(indMatch[0], 'w:firstLine');
        if (!firstLine || parseInt(firstLine) < 720) {
          const newInd = firstLine
            ? indMatch[0].replace(/w:firstLine="[^"]*"/, 'w:firstLine="720"')
            : indMatch[0].replace('>', ' w:firstLine="720">');
          indentFixed++;
          return match.replace(indMatch[0], newInd);
        }
      }
      
      return match;
    }
  );

  if (indentFixed > 0) {
    changes.push({
      ruleId: 'INDENT-001',
      description: `Added 0.5" first-line indent to ${indentFixed} body paragraph(s)`,
      location: 'Body text paragraphs',
      before: 'No or insufficient first-line indent',
      after: '0.5" (720 twips) first-line indent',
    });
  }

  return result;
}

/**
 * Remove italics from heading styles
 */
export function fixHeadingItalics(documentXml: string, changes: ChangeRecord[]): string {
  let italicFixed = 0;
  
  // Find heading paragraphs and remove italic
  const result = documentXml.replace(
    /(<w:p[ >][\s\S]*?<w:pPr>[\s\S]*?<w:pStyle\s+w:val="Heading[^"]*"[\s\S]*?<\/w:pPr>)([\s\S]*?)(<\/w:p>)/g,
    (match) => {
      if (/<w:i\s*\/>/.test(match) || /<w:i>/.test(match)) {
        italicFixed++;
        return match
          .replace(/<w:i\s*\/>/g, '')
          .replace(/<w:i\/>/g, '')
          .replace(/<w:i>\s*<\/w:i>/g, '');
      }
      return match;
    }
  );

  if (italicFixed > 0) {
    changes.push({
      ruleId: 'TEXT-001',
      description: `Removed italic formatting from ${italicFixed} heading(s)`,
      location: 'Heading paragraphs',
      before: 'Italic headings',
      after: 'Non-italic headings',
    });
  }

  return result;
}

/**
 * Fix reference spacing (single-spaced within, double-space between)
 */
export function fixReferenceSpacing(documentXml: string, changes: ChangeRecord[]): string {
  // This is a heuristic fix - look for paragraphs in References section
  // Mark them as single-spaced with 240pt space after
  let refFixed = 0;
  
  // Look for References section header and apply spacing to subsequent paragraphs
  const refSectionRegex = /(<w:t[^>]*>)(References|Bibliography|Works Cited)(<\/w:t>)/i;
  const refSectionMatch = refSectionRegex.exec(documentXml);
  
  if (refSectionMatch) {
    // We detected a references section - for MVP, just report
    refFixed++;
  }

  // For now, this is a detection-only fix in MVP
  // Full implementation would need to identify reference paragraphs and set spacing
  return documentXml;
}

// Helper to get XML attribute value
function getXmlAttr(xml: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr.replace(':', '\\:')}="([^"]*)"`, 'i');
  const match = regex.exec(xml);
  return match ? match[1] : undefined;
}

function twipsToInches(twips: number): string {
  return (twips / 1440).toFixed(2);
}
