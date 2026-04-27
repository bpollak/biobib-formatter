import { ChangeRecord } from '../types';
import { isBodySkipStyle } from '../style-skip';

// Match every <w:p> paragraph cleanly, handling both forms:
//   1. self-closing: <w:p/>
//   2. open + close: <w:p ...>...</w:p>
// A simpler regex like /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g over-matches because
// for self-closing <w:p/> it consumes everything through the *next*
// paragraph's </w:p>, yielding cross-paragraph captures and (when used in
// `replace`) inserting fixes at the wrong position. JS regex alternation
// is left-to-right so the self-closing alternative is tried first.
const PARAGRAPH_RE = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

// Open+close form for sectPr (used by the page-numbering fixers, which
// always need to inspect/mutate the children). Negative lookbehind
// excludes self-closing <w:sectPr/>: without it, the lazy `[\s\S]*?`
// would consume content through the *next* sectPr's </w:sectPr>,
// merging two sections into one match.
const SECTPR_PAIR_RE = /(<w:sectPr\b[^>]*(?<!\/)>)([\s\S]*?)(<\/w:sectPr>)/g;

/**
 * Set all page margins to 1" (1440 twips). Records one ChangeRecord per
 * failing margin rule so attribution in the report is accurate.
 */
export function fixMargins(
  documentXml: string,
  changes: ChangeRecord[],
  failingRuleIds: string[],
  targetMargins = { top: 1440, bottom: 1440, left: 1440, right: 1440, footer: 720 }
): string {
  const pgMarRegex = /<w:pgMar[^/]*\/>/g;
  const newPgMar = `<w:pgMar w:top="${targetMargins.top}" w:right="${targetMargins.right}" w:bottom="${targetMargins.bottom}" w:left="${targetMargins.left}" w:header="720" w:footer="${targetMargins.footer}" w:gutter="0"/>`;

  let firstBefore: string | undefined;
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
      if (!firstBefore) {
        firstBefore = `top=${twipsToInches(parseInt(topVal || '1440'))}", bottom=${twipsToInches(parseInt(bottomVal || '1440'))}", left=${twipsToInches(parseInt(leftVal || '1440'))}", right=${twipsToInches(parseInt(rightVal || '1440'))}"`;
      }
      return newPgMar;
    }
    return match;
  });

  if (firstBefore) {
    for (const ruleId of failingRuleIds) {
      changes.push({
        ruleId,
        description: 'Corrected page margins to minimum 1" on all sides, footer at 0.5"',
        location: 'Document section properties',
        before: firstBefore,
        after: '1" on all sides, page numbers 0.5" from bottom',
      });
    }
  }

  return result;
}

/**
 * Fix font colors to black in all runs and styles. Matches every <w:color>
 * tag form (self-closing, with sibling attributes like w:themeColor, and
 * non-self-closing) across documentXml, stylesXml, and any number of
 * supplemental XMLs (headers, footers, etc.).
 *
 * Skips <w:color> elements inside <w:rPrChange>/<w:pPrChange> blocks --
 * those are *historical* property snapshots stored by Word\'s track-changes
 * feature; mutating them would corrupt revision history.
 */
export function fixFontColors(
  documentXml: string,
  stylesXml: string,
  changes: ChangeRecord[],
  extraXmls: string[] = []
): { documentXml: string; stylesXml: string; extraXmls: string[] } {
  let colorFixed = 0;

  // Replace <w:rPrChange>/<w:pPrChange> blocks with unique sentinel
  // placeholders before fixing colors, then restore them. This preserves
  // the historical color record. The sentinel uses an XML processing
  // instruction format that won\'t collide with real document content.
  const fixColorsIn = (xml: string): string => {
    const stash: string[] = [];
    const masked = xml.replace(
      /<w:(?:rPrChange|pPrChange)\b[\s\S]*?<\/w:(?:rPrChange|pPrChange)>/g,
      (match) => {
        stash.push(match);
        return `<!--__RC_${stash.length - 1}__-->`;
      }
    );
    const fixed = masked.replace(/<w:color\b[^>]*>/g, (match) => {
      const valMatch = /w:val="([^"]+)"/.exec(match);
      if (!valMatch) return match;
      const colorVal = valMatch[1];
      // If themed, the rendered color comes from the theme — even if val
      // is already 000000, Word will paint the accent color. Strip theme
      // attributes whenever we touch this element so the val takes effect.
      const themed = /w:themeColor=|w:themeShade=|w:themeTint=/.test(match);
      const blackVal = colorVal === '000000' || colorVal.toLowerCase() === '000000' || colorVal === 'auto';
      if (blackVal && !themed) return match;
      colorFixed++;
      let result = match;
      if (!blackVal) result = result.replace(/w:val="[^"]+"/, 'w:val="000000"');
      // Strip theme attributes; whitespace cleanup keeps the tag tidy.
      result = result
        .replace(/\s+w:themeColor="[^"]*"/g, '')
        .replace(/\s+w:themeShade="[^"]*"/g, '')
        .replace(/\s+w:themeTint="[^"]*"/g, '')
        .replace(/\s+w:themeFill="[^"]*"/g, '');
      return result;
    });
    return fixed.replace(/<!--__RC_(\d+)__-->/g, (_, idx) => stash[parseInt(idx)]);
  };

  const newDocXml = fixColorsIn(documentXml);
  const newStylesXml = fixColorsIn(stylesXml);
  const newExtraXmls = extraXmls.map(fixColorsIn);

  if (colorFixed > 0) {
    changes.push({
      ruleId: 'FONT-005',
      description: `Changed ${colorFixed} colored text instance(s) to black`,
      location: 'Throughout document',
      before: 'Various colors',
      after: 'Black (#000000)',
    });
  }

  return { documentXml: newDocXml, stylesXml: newStylesXml, extraXmls: newExtraXmls };
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
 * Fix line spacing in body text to double-space.
 */
export function fixBodySpacing(documentXml: string, changes: ChangeRecord[]): string {
  let spacingFixed = 0;

  const result = documentXml.replace(PARAGRAPH_RE, (paragraphXml) => {
    if (/^<w:p\b[^>]*\/>$/.test(paragraphXml)) return paragraphXml;
    const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraphXml);
    if (!pPrMatch) return paragraphXml;
    const pPrContent = pPrMatch[1];

    const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPrContent);
    const styleName = styleMatch ? styleMatch[1] : 'Normal';
    if (isBodySkipStyle(styleName)) return paragraphXml;

    const spacingMatch = /<w:spacing[^>]*>/.exec(pPrContent);
    if (!spacingMatch) return paragraphXml;

    const lineVal = getXmlAttr(spacingMatch[0], 'w:line');
    const lineRuleVal = getXmlAttr(spacingMatch[0], 'w:lineRule');
    if (lineVal && parseInt(lineVal) >= 480 && lineRuleVal !== 'exact') {
      return paragraphXml;
    }
    let newSpacing = spacingMatch[0].replace(/w:line="[^"]*"/, 'w:line="480"');
    if (/w:lineRule="exact"/.test(newSpacing)) {
      newSpacing = newSpacing.replace(/w:lineRule="exact"/, 'w:lineRule="auto"');
    }
    spacingFixed++;
    return paragraphXml.replace(spacingMatch[0], newSpacing);
  });

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
 * Fix first-line indentation for body paragraphs. Handles three cases:
 *  1. paragraph has <w:ind> with no/insufficient firstLine → set firstLine
 *  2. paragraph has <w:pPr> but no <w:ind> → insert <w:ind w:firstLine="720"/>
 *  3. paragraph has no <w:pPr> at all → insert <w:pPr><w:ind .../></w:pPr>
 */
export function fixFirstLineIndent(documentXml: string, changes: ChangeRecord[]): string {
  let indentFixed = 0;

  const result = documentXml.replace(PARAGRAPH_RE, (paragraphXml) => {
      // Self-closing <w:p/> has no body to attach a fix to.
      if (/^<w:p\b[^>]*\/>$/.test(paragraphXml)) return paragraphXml;

      // Need substantial text to consider it a body paragraph (mirrors INDENT-001 check).
      const text = (paragraphXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
        .map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
        .join('');
      if (text.trim().length <= 20) return paragraphXml;

      const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraphXml);

      // Determine effective style. If no pPr, paragraph uses default (Normal) style.
      const styleMatch = pPrMatch && /<w:pStyle\s+w:val="([^"]+)"/.exec(pPrMatch[1]);
      const styleName = styleMatch ? styleMatch[1] : 'Normal';
      if (isBodySkipStyle(styleName)) return paragraphXml;

      if (pPrMatch) {
        const pPrContent = pPrMatch[1];
        const indMatch = /<w:ind\b[^>]*\/?>/.exec(pPrContent);
        if (indMatch) {
          // Case 1: existing <w:ind> — set/update firstLine.
          const firstLine = getXmlAttr(indMatch[0], 'w:firstLine');
          if (firstLine && parseInt(firstLine) >= 720) return paragraphXml;
          let newInd: string;
          if (firstLine) {
            newInd = indMatch[0].replace(/w:firstLine="[^"]*"/, 'w:firstLine="720"');
          } else if (indMatch[0].endsWith('/>')) {
            newInd = indMatch[0].replace('/>', ' w:firstLine="720"/>');
          } else {
            newInd = indMatch[0].replace('>', ' w:firstLine="720">');
          }
          indentFixed++;
          return paragraphXml.replace(indMatch[0], newInd);
        }
        // Case 2: pPr exists but no <w:ind> — insert one before </w:pPr>.
        indentFixed++;
        const newPPr = pPrMatch[0].replace('</w:pPr>', '<w:ind w:firstLine="720"/></w:pPr>');
        return paragraphXml.replace(pPrMatch[0], newPPr);
      }

      // Case 3: no <w:pPr> — insert a complete pPr block right after the opening <w:p ...>.
      const openTagMatch = /<w:p\b[^>]*>/.exec(paragraphXml);
      if (!openTagMatch) return paragraphXml;
      indentFixed++;
      return paragraphXml.replace(
        openTagMatch[0],
        openTagMatch[0] + '<w:pPr><w:ind w:firstLine="720"/></w:pPr>'
      );
  });

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
  
  const result = documentXml.replace(PARAGRAPH_RE, (paragraphXml) => {
    if (/^<w:p\b[^>]*\/>$/.test(paragraphXml)) return paragraphXml;
    if (!/<w:pStyle\s+w:val="Heading[^"]*"/.test(paragraphXml)) return paragraphXml;
    // The /<w:i\s*\/>/ and /<w:i>/ patterns match literal <w:i/> and <w:i>
    // (open tag) but not <w:iCs/> (which has "Cs" between "i" and ">").
    if (!/<w:i\s*\/>/.test(paragraphXml) && !/<w:i>/.test(paragraphXml)) return paragraphXml;
    italicFixed++;
    return paragraphXml
      .replace(/<w:i\s*\/>/g, '')
      .replace(/<w:i>\s*<\/w:i>/g, '');
  });

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

// ── Pagination fixes ─────────────────────────────────────────────────────

/**
 * Fix title page section to suppress page number display.
 * Ensures <w:titlePg/> is present in the first sectPr so the first-page
 * footer (which should be empty) is used instead of the default footer.
 */
export function fixTitlePageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  // Find the first sectPr in the document (title page section)
  // Single-match (not /g); same self-closing exclusion as SECTPR_PAIR_RE.
  const sectPrRegex = /(<w:sectPr\b[^>]*(?<!\/)>)([\s\S]*?)(<\/w:sectPr>)/;
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
  const sectPrMatches = [...documentXml.matchAll(SECTPR_PAIR_RE)];
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

// Section type detection by content keywords. Each sectPr's "content"
// is the document XML between the previous sectPr (or document start)
// and this sectPr. We classify by inspecting that content.
type SectionType = 'title' | 'copyright' | 'approval' | 'prelim' | 'body' | 'references' | 'unknown';

function extractTextRoughly(xml: string): string {
  // Pull plain text from <w:t> elements; ignores XML markup. Lowercased
  // for case-insensitive keyword matching.
  return (xml.match(/<w:t\b[^>]*(?<!\/)>([\s\S]*?)<\/w:t>/g) || [])
    .map(m => m.replace(/<w:t\b[^>]*(?<!\/)>|<\/w:t>/g, ''))
    .join(' ')
    .toLowerCase();
}

function classifyByExistingPgNum(sectPrContent: string): SectionType | null {
  // Strongest signal: the section already has page-numbering set. Roman
  // numerals (any case) → prelim. Decimal (or start with no fmt, which is
  // the OOXML default of decimal) → body.
  if (/<w:pgNumType[^>]*w:fmt="(?:lowerRoman|upperRoman)"/i.test(sectPrContent)) return 'prelim';
  if (/<w:pgNumType[^>]*w:fmt="decimal"/i.test(sectPrContent)) return 'body';
  if (/<w:pgNumType[^>]*w:start=/.test(sectPrContent) && !/w:fmt=/.test(sectPrContent)) return 'body';
  return null;
}

function classifySectionContent(precedingXml: string): SectionType {
  // Used only when no existing pgNumType signal is available. Content-
  // keyword classification — biased toward content IMMEDIATELY preceding
  // the sectPr (the tail), since that's what the *current* section
  // actually contains.
  const fullText = extractTextRoughly(precedingXml);
  const tailText = fullText.slice(-8000);

  const tailMatches = (re: RegExp) => re.test(tailText);
  if (tailMatches(/^references\b|^bibliography\b|^works\s+cited\b/m)) return 'references';
  if (tailMatches(/\bchapter\s+\d|\bchapter\s+one|\bchapter\s+two|\bchapter\s+three/)) return 'body';
  if (tailMatches(/dissertation\s+of\b[\s\S]{0,200}is\s+approved|committee\s+in\s+charge/)) return 'approval';
  if (tailMatches(/acknowledg|table\s+of\s+contents|\bvita\b|\bdedication\b|\bepigraph\b/)) return 'prelim';
  if (tailMatches(/copyright\s*©?|all\s+rights\s+reserved/)) return 'copyright';
  if (tailMatches(/university\s+of\s+california\s+san\s+diego/)) return 'title';
  if (/dissertation\s+of\b[\s\S]{0,200}is\s+approved/.test(fullText)) return 'approval';
  if (/^acknowledg|table\s+of\s+contents/i.test(fullText)) return 'prelim';
  return 'unknown';
}

interface SectionInfo {
  match: RegExpMatchArray;
  type: SectionType;
  index: number;
}

function detectSections(documentXml: string): SectionInfo[] {
  const matches = [...documentXml.matchAll(SECTPR_PAIR_RE)];
  const sections: SectionInfo[] = [];
  let prevEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const sectPrContent = m[2];
    // Existing pgNumType is the strongest signal; fall back to content
    // keywords only when the section has no page-numbering set yet.
    const byPgNum = classifyByExistingPgNum(sectPrContent);
    const preceding = documentXml.slice(prevEnd, start);
    const type = byPgNum ?? classifySectionContent(preceding);
    sections.push({ match: m, type, index: i });
    prevEnd = start + m[0].length;
  }
  return sections;
}

function pickSection(sections: SectionInfo[], preferredTypes: SectionType[]): SectionInfo | null {
  for (const t of preferredTypes) {
    const found = sections.find(s => s.type === t);
    if (found) return found;
  }
  return null;
}

function applyPgNumType(
  documentXml: string,
  section: SectionInfo,
  newPgNum: string
): { result: string; changed: boolean } {
  const [full, open, content, close] = section.match;
  let newContent: string;
  if (/<w:pgNumType[^/]*\/>/.test(content)) {
    newContent = content.replace(/<w:pgNumType[^/]*\/>/, newPgNum);
  } else {
    newContent = content + newPgNum;
  }
  const newSectPr = open + newContent + close;
  if (newSectPr === full) return { result: documentXml, changed: false };
  // Use position-based slicing rather than `documentXml.replace(full, ...)`
  // — the latter replaces the *first* string match, which collides when
  // multiple sectPrs in the document have identical structure (very
  // common in templated dissertations).
  const start = section.match.index ?? 0;
  const end = start + full.length;
  return {
    result: documentXml.slice(0, start) + newSectPr + documentXml.slice(end),
    changed: true,
  };
}

/**
 * Set preliminary pages to use lowercase Roman numerals starting at iii.
 * Picks the section whose preceding content looks like a preliminary
 * section (acknowledgments, table of contents, abstract, etc.). Falls
 * back to the approval section, then "first non-title non-body section",
 * then the first sectPr.
 */
export function fixPreliminaryPageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  const sections = detectSections(documentXml);
  if (sections.length === 0) return documentXml;

  const target =
    pickSection(sections, ['prelim', 'approval']) ||
    sections.find(s => s.type !== 'title' && s.type !== 'copyright' && s.type !== 'body') ||
    sections[0];

  const romanPgNum = '<w:pgNumType w:fmt="lowerRoman" w:start="3"/>';
  const { result, changed } = applyPgNumType(documentXml, target, romanPgNum);
  if (!changed) return documentXml;

  changes.push({
    ruleId: 'PAGE-003',
    description: 'Set preliminary section page numbering to lowercase Roman numerals starting at iii',
    location: `Section ${target.index + 1} properties (detected: ${target.type})`,
    before: 'No or incorrect pgNumType',
    after: 'pgNumType fmt="lowerRoman" start="3"',
  });
  return result;
}

/**
 * Set body section to use Arabic numerals starting at 1. Picks the
 * section whose preceding content looks like the body (chapter,
 * introduction). Falls back to the last non-references section, then
 * the last sectPr.
 */
export function fixBodyPageNumbering(documentXml: string, changes: ChangeRecord[]): string {
  const sections = detectSections(documentXml);
  if (sections.length === 0) return documentXml;

  let target = sections.find(s => s.type === 'body');
  if (!target) {
    const nonRef = [...sections].reverse().find(s => s.type !== 'references');
    target = nonRef ?? sections[sections.length - 1];
  }

  const arabicPgNum = '<w:pgNumType w:fmt="decimal" w:start="1"/>';
  const { result, changed } = applyPgNumType(documentXml, target, arabicPgNum);
  if (!changed) return documentXml;

  changes.push({
    ruleId: 'PAGE-005',
    description: 'Set body section page numbering to Arabic numerals starting at 1',
    location: `Section ${target.index + 1} properties (detected: ${target.type})`,
    before: 'No or incorrect pgNumType',
    after: 'pgNumType fmt="decimal" start="1"',
  });
  return result;
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
  // Process each paragraph in the footer. Use the same alternation form
  // as PARAGRAPH_RE to handle <w:p/> self-closing without over-matching.
  const result = footerXml.replace(PARAGRAPH_RE, (paragraphXml) => {
    if (/^<w:p\b[^>]*\/>$/.test(paragraphXml)) return paragraphXml;
    if (!/PAGE/.test(paragraphXml) && !/<w:pgNum/.test(paragraphXml)) return paragraphXml;

    // Split the paragraph into open tag, content, close tag.
    const openMatch = /^<w:p\b[^>]*>/.exec(paragraphXml);
    if (!openMatch) return paragraphXml;
    const open = openMatch[0];
    const content = paragraphXml.slice(open.length, -('</w:p>'.length));

    if (/<w:jc\s+w:val="center"/.test(content)) return paragraphXml;

    if (/<w:pPr>/.test(content)) {
      // Replace existing jc or insert before </w:pPr>.
      if (/<w:jc\s+w:val="[^"]*"/.test(content)) {
        modified = true;
        return open + content.replace(/<w:jc\s+w:val="[^"]*"\s*\/>/, '<w:jc w:val="center"/>') + '</w:p>';
      }
      modified = true;
      return open + content.replace(/<\/w:pPr>/, '<w:jc w:val="center"/></w:pPr>') + '</w:p>';
    }

    modified = true;
    return open + '<w:pPr><w:jc w:val="center"/></w:pPr>' + content + '</w:p>';
  });

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
 * Add placeholder alt text to images missing it. Matches both the
 * self-closing form (<wp:docPr ... />) and the open form
 * (<wp:docPr ...>...</wp:docPr>).
 */
export function fixImageAltText(documentXml: string, changes: ChangeRecord[]): string {
  let fixed = 0;

  const result = documentXml.replace(
    /<wp:docPr\b([^>]*?)(\/?)>/g,
    (match, attrs: string, slash: string) => {
      const descrMatch = /descr="([^"]*)"/.exec(attrs);
      if (descrMatch && descrMatch[1].trim() !== '') return match;

      fixed++;
      if (descrMatch) {
        // Empty descr — replace it in place; preserves opening/closing form.
        return match.replace(/descr="[^"]*"/, 'descr="[Image - description required]"');
      }
      // No descr — append it before the (optional) self-closing slash.
      return `<wp:docPr${attrs} descr="[Image - description required]"${slash}>`;
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

// Helper to get XML attribute value. XML attribute names are case-sensitive.
function getXmlAttr(xml: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr.replace(':', '\\:')}="([^"]*)"`);
  const match = regex.exec(xml);
  return match ? match[1] : undefined;
}

function twipsToInches(twips: number): string {
  return (twips / 1440).toFixed(2);
}
