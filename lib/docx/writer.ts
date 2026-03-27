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
      (footerVal && parseInt(footerVal) < targetMargins.footer);

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
        // Fix spacing - preserve lineRule attribute
        let newSpacing = spacingMatch[0].replace(
          /w:line="[^"]*"/,
          'w:line="480"'
        );
        // If lineRule was "exact", change to "auto" for proportional double-spacing
        if (/w:lineRule="exact"/.test(newSpacing)) {
          newSpacing = newSpacing.replace(/w:lineRule="exact"/, 'w:lineRule="auto"');
        }
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

      // Check indentation - handle both <w:ind .../> and <w:ind ...>
      const indMatch = /<w:ind[^>]*\/?>/.exec(pPrContent);
      if (indMatch) {
        const firstLine = getXmlAttr(indMatch[0], 'w:firstLine');
        if (!firstLine || parseInt(firstLine) < 720) {
          let newInd: string;
          if (firstLine) {
            newInd = indMatch[0].replace(/w:firstLine="[^"]*"/, 'w:firstLine="720"');
          } else if (indMatch[0].endsWith('/>')) {
            // Self-closing: <w:ind w:left="0"/> → <w:ind w:left="0" w:firstLine="720"/>
            newInd = indMatch[0].replace('/>', ' w:firstLine="720"/>');
          } else {
            newInd = indMatch[0].replace('>', ' w:firstLine="720">');
          }
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
  
  // Find heading paragraphs and remove italic (handle any attribute order in pPr)
  const result = documentXml.replace(
    /(<w:p\b[^>]*>[\s\S]*?<w:pPr>[\s\S]*?<\/w:pPr>)([\s\S]*?)(<\/w:p>)/g,
    (match) => {
      // Only process if this paragraph has a Heading style
      if (!/<w:pStyle\s+w:val="Heading[^"]*"/.test(match)) return match;
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
  // Detection-only in MVP — full implementation would need to identify reference paragraphs
  return documentXml;
}

// ── Pagination fixes ─────────────────────────────────────────────────────

/**
 * Fix title page section to suppress page number display.
 * Ensures <w:titlePg/> is present in the first sectPr so the first-page
 * footer (which should be empty) is used instead of the default footer.
 */
export function fixTitlePageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  // Find the first sectPr in the document (title page section)
  const sectPrRegex = /(<w:sectPr\b[^>]*>)([\s\S]*?)(<\/w:sectPr>)/;
  const match = sectPrRegex.exec(documentXml);
  if (!match) return documentXml;

  const [full, open, content, close] = match;

  // Add <w:titlePg/> if not already present
  if (!/<w:titlePg/.test(content)) {
    const newContent = content + '<w:titlePg/>';
    const newSectPr = open + newContent + close;
    changes.push({
      ruleId: 'PAGE-001',
      description: 'Added titlePg element to first section so the title page uses a separate (empty) first-page footer',
      location: 'First section properties',
      before: 'No titlePg element',
      after: '<w:titlePg/> added — title page will not display a page number',
    });
    return documentXml.replace(full, newSectPr);
  }
  return documentXml;
}

/**
 * Ensure copyright page (page ii) does not display a page number.
 * Uses the same titlePg mechanism — the first section covers both
 * the title page and the copyright page when they share a section,
 * or we add titlePg to the second sectPr if it exists.
 */
export function fixCopyrightPageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  // The titlePg element on the first section already suppresses the first page.
  // If there's a separate second section for the copyright page, add titlePg there too.
  const sectPrMatches = [...documentXml.matchAll(/(<w:sectPr\b[^>]*>)([\s\S]*?)(<\/w:sectPr>)/g)];
  if (sectPrMatches.length < 2) {
    // Single section — titlePg from PAGE-001 fix handles both pages
    return documentXml;
  }

  const second = sectPrMatches[1];
  const [full, open, content, close] = second;
  if (!/<w:titlePg/.test(content)) {
    const newSectPr = open + content + '<w:titlePg/>' + close;
    changes.push({
      ruleId: 'PAGE-002',
      description: 'Added titlePg element to copyright page section to suppress page number display',
      location: 'Second section properties',
      before: 'No titlePg element',
      after: '<w:titlePg/> added — copyright page will not display a page number',
    });
    return documentXml.replace(full, newSectPr);
  }
  return documentXml;
}

/**
 * Set preliminary pages to use lowercase Roman numerals starting at iii.
 * Finds the sectPr that should govern the preliminary section and sets
 * <w:pgNumType w:fmt="lowerRoman" w:start="3"/>
 */
export function fixPreliminaryPageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  const sectPrMatches = [...documentXml.matchAll(/(<w:sectPr\b[^>]*>)([\s\S]*?)(<\/w:sectPr>)/g)];
  if (sectPrMatches.length === 0) return documentXml;

  // The preliminary section is typically the first (or second if there's a separate title section).
  // We look for the first sectPr that doesn't already have fmt="decimal".
  let targetIdx = 0;
  for (let i = 0; i < sectPrMatches.length; i++) {
    const content = sectPrMatches[i][2];
    // Skip sections that are clearly the body (decimal format)
    if (/w:fmt="decimal"/.test(content)) continue;
    targetIdx = i;
    break;
  }

  const [full, open, content, close] = sectPrMatches[targetIdx];
  const romanPgNum = '<w:pgNumType w:fmt="lowerRoman" w:start="3"/>';

  let newContent: string;
  if (/<w:pgNumType[^/]*\/>/.test(content)) {
    // Replace existing pgNumType
    newContent = content.replace(/<w:pgNumType[^/]*\/>/, romanPgNum);
  } else {
    // Add pgNumType
    newContent = content + romanPgNum;
  }

  const newSectPr = open + newContent + close;
  if (newSectPr !== full) {
    changes.push({
      ruleId: 'PAGE-003',
      description: 'Set preliminary section page numbering to lowercase Roman numerals starting at iii',
      location: `Section ${targetIdx + 1} properties`,
      before: 'No or incorrect pgNumType',
      after: 'pgNumType fmt="lowerRoman" start="3"',
    });
    return documentXml.replace(full, newSectPr);
  }
  return documentXml;
}

/**
 * Set body section to use Arabic numerals starting at 1.
 * Finds the last sectPr (typically body/main section) and sets
 * <w:pgNumType w:fmt="decimal" w:start="1"/>
 */
export function fixBodyPageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  const sectPrMatches = [...documentXml.matchAll(/(<w:sectPr\b[^>]*>)([\s\S]*?)(<\/w:sectPr>)/g)];
  if (sectPrMatches.length === 0) return documentXml;

  // Body section is typically the last sectPr
  const targetIdx = sectPrMatches.length - 1;
  const [full, open, content, close] = sectPrMatches[targetIdx];
  const arabicPgNum = '<w:pgNumType w:fmt="decimal" w:start="1"/>';

  let newContent: string;
  if (/<w:pgNumType[^/]*\/>/.test(content)) {
    newContent = content.replace(/<w:pgNumType[^/]*\/>/, arabicPgNum);
  } else {
    newContent = content + arabicPgNum;
  }

  const newSectPr = open + newContent + close;
  if (newSectPr !== full) {
    changes.push({
      ruleId: 'PAGE-005',
      description: 'Set body section page numbering to Arabic numerals starting at 1',
      location: `Section ${targetIdx + 1} properties`,
      before: 'No or incorrect pgNumType',
      after: 'pgNumType fmt="decimal" start="1"',
    });
    return documentXml.replace(full, newSectPr);
  }
  return documentXml;
}

/**
 * Center page numbers in footer files.
 * Finds paragraphs in footer XML that contain PAGE fields and
 * ensures they have <w:jc w:val="center"/>.
 */
export function fixFooterPageNumberCentering(footerXml: string, changes: ChangeRecord[]): string {
  // Find paragraphs containing PAGE fields
  const hasPageField = /PAGE/.test(footerXml) || /<w:pgNum/.test(footerXml);
  if (!hasPageField) return footerXml;

  let modified = false;
  // Process each paragraph in the footer
  const result = footerXml.replace(
    /(<w:p\b[^>]*>)([\s\S]*?)(<\/w:p>)/g,
    (match, open, content, close) => {
      // Only process paragraphs that contain PAGE fields
      if (!/PAGE/.test(match) && !/<w:pgNum/.test(match)) return match;

      // Check if already centered
      if (/<w:jc\s+w:val="center"/.test(content)) return match;

      // Check if pPr exists
      if (/<w:pPr>/.test(content)) {
        // Add jc to existing pPr (or replace existing jc)
        if (/<w:jc\s+w:val="[^"]*"/.test(content)) {
          modified = true;
          return open + content.replace(/<w:jc\s+w:val="[^"]*"\s*\/>/, '<w:jc w:val="center"/>') + close;
        }
        modified = true;
        return open + content.replace(/<\/w:pPr>/, '<w:jc w:val="center"/></w:pPr>') + close;
      }

      // No pPr — add one with jc
      modified = true;
      return open + '<w:pPr><w:jc w:val="center"/></w:pPr>' + content + close;
    }
  );

  if (modified) {
    changes.push({
      ruleId: 'PAGE-006',
      description: 'Centered page number paragraph in footer',
      location: 'Footer',
      before: 'Page number not centered',
      after: 'Page number centered (jc="center")',
    });
  }

  return result;
}

// ── Accessibility fixes ──────────────────────────────────────────────────

/**
 * Add placeholder alt text to images missing it.
 * Finds <wp:docPr> elements without a descr attribute (or with empty descr)
 * and adds descr="[Image - description required]".
 */
export function fixImageAltText(documentXml: string, changes: ChangeRecord[]): string {
  let fixed = 0;

  const result = documentXml.replace(
    /<wp:docPr([^>]*)\/>/g,
    (match, attrs: string) => {
      const descrMatch = /descr="([^"]*)"/.exec(attrs);
      if (descrMatch && descrMatch[1].trim() !== '') return match;

      fixed++;
      if (descrMatch) {
        // Empty descr — replace it
        return match.replace(/descr="[^"]*"/, 'descr="[Image - description required]"');
      }
      // No descr at all — add it
      return `<wp:docPr${attrs} descr="[Image - description required]"/>`;
    }
  );

  if (fixed > 0) {
    changes.push({
      ruleId: 'A11Y-002',
      description: `Added placeholder alt text to ${fixed} image(s). Update these with real descriptions.`,
      location: 'Throughout document',
      before: 'Missing alt text',
      after: '[Image - description required] placeholder added',
    });
  }

  return result;
}

/**
 * Mark the first row of each table as a header row.
 * Adds <w:tblHeader/> to the first <w:trPr> in each <w:tbl>.
 */
export function fixTableHeaders(documentXml: string, changes: ChangeRecord[]): string {
  let fixed = 0;

  const result = documentXml.replace(
    /<w:tbl>([\s\S]*?)<\/w:tbl>/g,
    (match, tblContent: string) => {
      // Check if first row already has tblHeader
      if (/<w:tblHeader/.test(tblContent)) return match;

      // Find the first row (<w:tr>)
      const firstRowRegex = /(<w:tr\b[^>]*>)([\s\S]*?)(<\/w:tr>)/;
      const rowMatch = firstRowRegex.exec(tblContent);
      if (!rowMatch) return match;

      const [rowFull, rowOpen, rowContent, rowClose] = rowMatch;

      let newRow: string;
      if (/<w:trPr>/.test(rowContent)) {
        // Add tblHeader to existing trPr
        newRow = rowOpen + rowContent.replace(/<\/w:trPr>/, '<w:tblHeader/></w:trPr>') + rowClose;
      } else {
        // Add trPr with tblHeader after the opening tag
        newRow = rowOpen + '<w:trPr><w:tblHeader/></w:trPr>' + rowContent + rowClose;
      }

      fixed++;
      return match.replace(rowFull, newRow);
    }
  );

  if (fixed > 0) {
    changes.push({
      ruleId: 'A11Y-003',
      description: `Marked first row as header row in ${fixed} table(s)`,
      location: 'Throughout document',
      before: 'No table header markup',
      after: '<w:tblHeader/> added to first row',
    });
  }

  return result;
}

/**
 * Set document language to en-US in styles.xml default run properties.
 */
export function fixDocumentLanguage(stylesXml: string, changes: ChangeRecord[]): string {
  if (!stylesXml) return stylesXml;

  // Check if language is already set correctly
  if (/<w:lang[^>]+w:val="en-US"/.test(stylesXml)) return stylesXml;

  let modified = false;

  // Try to add/update lang in docDefaults > rPrDefault > rPr
  if (/<w:docDefaults>/.test(stylesXml)) {
    if (/<w:rPrDefault>/.test(stylesXml)) {
      if (/<w:rPr>/.test(stylesXml)) {
        // rPr exists inside rPrDefault — add or replace lang
        if (/<w:lang[^>]*\/>/.test(stylesXml)) {
          // Replace existing lang — set all sub-attributes
          modified = true;
          stylesXml = stylesXml.replace(
            /(<w:rPrDefault>[\s\S]*?<w:rPr>[\s\S]*?)<w:lang[^/]*\/>/,
            '$1<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>'
          );
        } else {
          // Add lang before closing rPr inside rPrDefault
          modified = true;
          stylesXml = stylesXml.replace(
            /(<w:rPrDefault>[\s\S]*?<w:rPr>[\s\S]*?)(<\/w:rPr>)/,
            '$1<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>$2'
          );
        }
      } else {
        // rPrDefault exists but no rPr inside — add rPr with lang
        modified = true;
        stylesXml = stylesXml.replace(
          /<w:rPrDefault>/,
          '<w:rPrDefault><w:rPr><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr>'
        );
      }
    } else {
      // docDefaults exists but no rPrDefault — add it
      modified = true;
      stylesXml = stylesXml.replace(
        /<w:docDefaults>/,
        '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
      );
    }
  } else {
    // No docDefaults — add it after the opening <w:styles> tag
    modified = true;
    stylesXml = stylesXml.replace(
      /(<w:styles[^>]*>)/,
      '$1<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault></w:docDefaults>'
    );
  }

  if (modified) {
    changes.push({
      ruleId: 'A11Y-005',
      description: 'Set document default language to English (en-US)',
      location: 'styles.xml docDefaults',
      before: 'Language not set or not en-US',
      after: 'w:lang val="en-US"',
    });
  }

  return stylesXml;
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
