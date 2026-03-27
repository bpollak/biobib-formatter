import JSZip from 'jszip';
import {
  DocumentModel, DocumentMetadata, ParagraphInfo, MarginInfo,
  StyleInfo, FigureInfo, TableInfo, ReferenceInfo, TitlePageInfo,
  AbstractInfo, PageNumberingInfo, SectionInfo, PageInfo
} from '../types';
import {
  readDocxFiles, parseMargins, extractParagraphs, extractParagraphText,
  getParagraphStyle, getParagraphAlignment, getLineSpacing, getSpacing,
  getIndentation, extractRuns, getRunFonts, getRunFontSize, getRunColor,
  isRunItalic, isRunBold, hasDrawing, getDrawingAltText, isHeadingStyle,
  getHeadingLevel, parseStyleFonts
} from '../docx/reader';
import { APPROVED_FONTS } from '../constants';

export async function parseDocument(buffer: Buffer, metadata: DocumentMetadata): Promise<DocumentModel> {
  const files = await readDocxFiles(buffer);
  const { documentXml, stylesXml } = files;

  // Parse margins
  const rawMargins = parseMargins(documentXml);
  const margins: MarginInfo[] = rawMargins.map((m, i) => ({ ...m, sectionIndex: i }));

  // Parse paragraphs
  const paragraphXmls = extractParagraphs(documentXml);
  const styleMap = parseStyleFonts(stylesXml);
  
  const paragraphs: ParagraphInfo[] = [];
  const figures: FigureInfo[] = [];
  const tables: TableInfo[] = [];

  let figureCount = 0;
  let tableCount = 0;

  for (let i = 0; i < paragraphXmls.length; i++) {
    const pXml = paragraphXmls[i];
    const text = extractParagraphText(pXml);
    const style = getParagraphStyle(pXml);
    const alignment = getParagraphAlignment(pXml);
    const lineSpacing = getLineSpacing(pXml);
    const spacing = getSpacing(pXml);
    const indent = getIndentation(pXml);

    // Extract run-level properties (use first run's values as representative)
    const runs = extractRuns(pXml);
    let fontSize: number | undefined;
    let fontFamily: string | undefined;
    let color: string | undefined;
    let italic = false;
    let bold = false;

    for (const run of runs) {
      if (!fontSize) fontSize = getRunFontSize(run);
      if (!fontFamily) fontFamily = getRunFonts(run);
      if (!color) color = getRunColor(run);
      if (isRunItalic(run)) italic = true;
      if (isRunBold(run)) bold = true;
    }

    // Check style map for inherited properties
    const styleInfo = styleMap.get(style);
    if (!fontFamily && styleInfo?.font) fontFamily = styleInfo.font;
    if (!fontSize && styleInfo?.size) fontSize = styleInfo.size;
    if (!color && styleInfo?.color) color = styleInfo.color;

    const isHeading = isHeadingStyle(style);
    const headingLevel = isHeading ? getHeadingLevel(style) : undefined;
    const isCaption = /caption/i.test(style);
    const isEmpty = text.trim().length === 0;

    // Detect figures (drawings)
    if (hasDrawing(pXml)) {
      const altText = getDrawingAltText(pXml);
      const figure: FigureInfo = {
        index: figureCount++,
        paragraphIndex: i,
        hasCaption: false,
        hasAltText: !!altText && altText.trim() !== '',
        altText,
      };
      // Look for caption in adjacent paragraphs (will be set after all paragraphs are parsed)
      figures.push(figure);
    }

    // Table detection moved to document-level parsing below

    paragraphs.push({
      index: i,
      text,
      style,
      fontSize,
      fontFamily,
      bold,
      italic,
      color,
      lineSpacing,
      spaceBefore: spacing.before,
      spaceAfter: spacing.after,
      indentLeft: indent.left,
      indentRight: indent.right,
      indentFirstLine: indent.firstLine || (indent.hanging ? undefined : undefined),
      alignment,
      isHeading,
      headingLevel,
      isCaption,
      isEmpty,
    });
  }

  // Associate captions with figures and tables
  for (const figure of figures) {
    const paraIdx = figure.paragraphIndex;
    // Look at next paragraph for caption
    if (paraIdx + 1 < paragraphs.length && paragraphs[paraIdx + 1].isCaption) {
      figure.hasCaption = true;
      figure.captionParagraphIndex = paraIdx + 1;
      figure.captionPosition = 'after';
      figure.captionText = paragraphs[paraIdx + 1].text;
    } else if (paraIdx > 0 && paragraphs[paraIdx - 1].isCaption) {
      figure.hasCaption = true;
      figure.captionParagraphIndex = paraIdx - 1;
      figure.captionPosition = 'before';
      figure.captionText = paragraphs[paraIdx - 1].text;
    }
    // Also check for "Figure X." text pattern nearby
    if (!figure.hasCaption) {
      for (let offset = -2; offset <= 2; offset++) {
        const idx = paraIdx + offset;
        if (idx >= 0 && idx < paragraphs.length && offset !== 0) {
          if (/^(figure|fig\.?)\s+\d+/i.test(paragraphs[idx].text.trim())) {
            figure.hasCaption = true;
            figure.captionParagraphIndex = idx;
            figure.captionPosition = offset > 0 ? 'after' : 'before';
            figure.captionText = paragraphs[idx].text;
            break;
          }
        }
      }
    }
  }

  for (const table of tables) {
    const paraIdx = table.paragraphIndex;
    if (paraIdx > 0 && (paragraphs[paraIdx - 1].isCaption || /^table\s+\d+/i.test(paragraphs[paraIdx - 1].text.trim()))) {
      table.hasCaption = true;
      table.captionParagraphIndex = paraIdx - 1;
      table.captionPosition = 'before';
      table.captionText = paragraphs[paraIdx - 1].text;
    } else if (paraIdx + 1 < paragraphs.length && (paragraphs[paraIdx + 1].isCaption || /^table\s+\d+/i.test(paragraphs[paraIdx + 1].text.trim()))) {
      table.hasCaption = true;
      table.captionParagraphIndex = paraIdx + 1;
      table.captionPosition = 'after';
      table.captionText = paragraphs[paraIdx + 1].text;
    }
  }

  // Detect tables from document-level XML (w:tbl elements at body level)
  const tableXmlRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
  let tblMatch;
  while ((tblMatch = tableXmlRegex.exec(documentXml)) !== null) {
    const tblContent = tblMatch[1];
    const hasHeaderRow = /<w:tblHeader/.test(tblContent);
    // Find the nearest paragraph index by locating the table position in XML
    const tblPosition = tblMatch.index;
    let nearestParagraphIndex = 0;
    // Find how many paragraphs come before this table in the XML
    const xmlBefore = documentXml.slice(0, tblPosition);
    const pCountBefore = (xmlBefore.match(/<w:p[ >]/g) || []).length;
    nearestParagraphIndex = Math.min(pCountBefore, paragraphs.length - 1);

    tables.push({
      index: tableCount++,
      paragraphIndex: Math.max(0, nearestParagraphIndex),
      hasCaption: false,
      hasHeaderRow,
      isMultiPage: false,
    });
  }

  // Collect styles
  const allFonts: string[] = [];
  const allSizes: number[] = [];
  const allColors: string[] = [];

  for (const p of paragraphs) {
    if (p.fontFamily) allFonts.push(p.fontFamily);
    if (p.fontSize) allSizes.push(p.fontSize);
    if (p.color && p.color !== 'auto') allColors.push(p.color);
  }

  // Only use fonts actually used in body text paragraphs, not style definitions
  // (styles.xml may reference built-in fonts like Calibri that aren't actually used)

  const uniqueFonts = [...new Set(allFonts)].filter(Boolean);
  const uniqueSizes = [...new Set(allSizes)].filter(Boolean);
  const uniqueColors = [...new Set(allColors)].filter(Boolean);
  const hasColoredText = uniqueColors.some(c => c !== '000000' && c.toLowerCase() !== '000000' && c !== 'auto');

  // Determine dominant font and size
  const fontFreq: Record<string, number> = {};
  allFonts.forEach(f => { fontFreq[f] = (fontFreq[f] || 0) + 1; });
  const dominantFont = Object.entries(fontFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Times New Roman';

  const sizeFreq: Record<number, number> = {};
  allSizes.forEach(s => { sizeFreq[s] = (sizeFreq[s] || 0) + 1; });
  const dominantSize = Number(Object.entries(sizeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '24');

  const styles: StyleInfo = {
    fonts: uniqueFonts,
    sizes: uniqueSizes,
    colors: uniqueColors,
    hasColoredText,
    dominantFont,
    dominantSize,
  };

  // Detect sections
  const sections = detectSections(paragraphs, metadata);

  // Parse title page
  const titlePage = parseTitlePage(paragraphs, sections);

  // Parse abstract
  const abstractInfo = parseAbstract(paragraphs, sections, margins);

  // Parse page numbering (using footer XMLs for reliable detection)
  const pageNumbering = parsePageNumbering(documentXml, files.footerXmls);

  // Parse references
  const references = parseReferences(paragraphs);

  // Pages (simple detection)
  const pages: PageInfo[] = [];

  return {
    metadata,
    rawXml: documentXml,
    stylesXml,
    numberingXml: files.numberingXml,
    paragraphs,
    margins,
    styles,
    figures,
    tables,
    references,
    titlePage,
    abstract: abstractInfo,
    pageNumbering,
    sections,
    pages,
  };
}

function detectSections(paragraphs: ParagraphInfo[], metadata: DocumentMetadata): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const assignedParagraphs = new Set<number>();

  let i = 0;
  while (i < paragraphs.length) {
    const text = paragraphs[i].text.trim().toLowerCase();

    // Title page: usually starts at 0, has "university of california"
    if (i === 0) {
      const titleEnd = Math.min(20, paragraphs.length);
      sections.push({
        type: 'title',
        startParagraphIndex: 0,
        endParagraphIndex: titleEnd,
        detected: paragraphs.slice(0, titleEnd).some(p =>
          /university\s+of\s+california/i.test(p.text)
        ),
        confidence: 'medium',
      });
      for (let j = 0; j < titleEnd; j++) assignedParagraphs.add(j);
    }

    // Copyright detection: require explicit copyright text (not just empty paragraphs)
    if (/copyright\s*©?|all\s+rights\s+reserved/.test(text) && !assignedParagraphs.has(i)) {
      const end = Math.min(i + 5, paragraphs.length);
      sections.push({
        type: 'copyright',
        startParagraphIndex: i,
        endParagraphIndex: end,
        detected: true,
        confidence: 'high',
      });
      for (let j = i; j < end; j++) assignedParagraphs.add(j);
    }

    if (/dissertation.*approval|thesis.*approval|committee\s+in\s+charge|the\s+dissertation.*by/i.test(text)) {
      sections.push({
        type: 'approval',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 30, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^table\s+of\s+contents$/i.test(text)) {
      sections.push({
        type: 'toc',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 100, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^acknowledg(e?ments?|ements?)$/i.test(text)) {
      sections.push({
        type: 'acknowledgements',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 50, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^vita$/i.test(text)) {
      sections.push({
        type: 'vita',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 30, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^abstract\s+(of\s+the\s+(dissertation|thesis)|of\s+(dissertation|thesis)|dissertation|thesis)?$/i.test(text) ||
        text === 'abstract') {
      sections.push({
        type: 'abstract',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 30, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^(references|bibliography|works\s+cited)$/i.test(text)) {
      sections.push({
        type: 'references',
        startParagraphIndex: i,
        endParagraphIndex: paragraphs.length,
        detected: true,
        confidence: 'high',
      });
    }

    if (/^appendix\s*[a-z]?$/i.test(text)) {
      sections.push({
        type: 'appendix',
        startParagraphIndex: i,
        endParagraphIndex: Math.min(i + 100, paragraphs.length),
        detected: true,
        confidence: 'high',
      });
    }

    if (/^chapter\s+\d+|^introduction$|^conclusion/i.test(text)) {
      if (!sections.find(s => s.type === 'body')) {
        sections.push({
          type: 'body',
          startParagraphIndex: i,
          endParagraphIndex: paragraphs.length,
          detected: true,
          confidence: 'medium',
        });
      }
    }

    i++;
  }

  return sections;
}

function parseTitlePage(paragraphs: ParagraphInfo[], sections: SectionInfo[]): TitlePageInfo {
  const titleSection = sections.find(s => s.type === 'title');
  const titleParas = titleSection
    ? paragraphs.slice(titleSection.startParagraphIndex, Math.min(titleSection.endParagraphIndex, 30))
    : paragraphs.slice(0, 30);

  const texts = titleParas.map(p => p.text.trim());
  const allText = texts.join('\n');

  const hasUniversityName = /university\s+of\s+california\s+san\s+diego/i.test(allText);
  const universityNameCorrect = /UNIVERSITY OF CALIFORNIA SAN DIEGO/.test(allText);
  const hasInLine = texts.some(t => /^in$/i.test(t));
  const hasbyLine = texts.some(t => /^by$/i.test(t));

  // Detect committee section
  const committeeLineIdx = texts.findIndex(t => /committee\s+in\s+charge/i.test(t));
  const committeeDetected = committeeLineIdx !== -1;

  let committeeChairFirst: boolean | undefined;
  let committeeMembersAlphabetized: boolean | undefined;
  let committeeIndented: boolean | undefined;
  let committeeSingleSpaced: boolean | undefined;

  if (committeeDetected) {
    // Look at indentation of paragraphs after "Committee in Charge"
    const afterCommittee = titleParas.slice(committeeLineIdx + 1, committeeLineIdx + 10);
    committeeIndented = afterCommittee.some(p => p.indentLeft && p.indentLeft >= 720);
    committeeSingleSpaced = afterCommittee.every(p =>
      !p.lineSpacing || p.lineSpacing <= 300
    );

    // Check if chair is mentioned
    const memberParas = afterCommittee.filter(p => p.text.trim().length > 2);
    committeeChairFirst = memberParas.some(p => /chair|co-chair/i.test(p.text));

    // Check alphabetical order (by last word of each line)
    if (memberParas.length > 2) {
      const names = memberParas
        .filter(p => !/chair|co-chair/i.test(p.text))
        .map(p => {
          const words = p.text.trim().split(/\s+/);
          return words[words.length - 1].toLowerCase();
        });
      const sorted = [...names].sort();
      committeeMembersAlphabetized = JSON.stringify(names) === JSON.stringify(sorted);
    }
  }

  return {
    detected: hasUniversityName || titleSection?.detected || false,
    hasUniversityName,
    universityNameCorrect,
    hasInLine,
    hasbyLine,
    committeeDetected,
    committeeChairFirst,
    committeeMembersAlphabetized,
    committeeIndented,
    committeeSingleSpaced,
    paragraphIndices: titleParas.map(p => p.index),
  };
}

function parseAbstract(
  paragraphs: ParagraphInfo[],
  sections: SectionInfo[],
  margins: MarginInfo[]
): AbstractInfo {
  const abstractSection = sections.find(s => s.type === 'abstract');
  
  if (!abstractSection) {
    // Try to find by text
    const abstractIdx = paragraphs.findIndex(p =>
      /^abstract/i.test(p.text.trim())
    );
    if (abstractIdx === -1) {
      return { detected: false, wordCount: 0, paragraphIndices: [] };
    }
    
    // Find end boundary: stop at next section heading or large gap
    let endIdx = Math.min(abstractIdx + 20, paragraphs.length);
    for (let j = abstractIdx + 1; j < endIdx; j++) {
      const pText = paragraphs[j].text.trim().toLowerCase();
      if (paragraphs[j].isHeading ||
          /^(chapter\s+\d|introduction|table\s+of\s+contents|acknowledgements?|vita|references|bibliography)$/i.test(pText)) {
        endIdx = j;
        break;
      }
    }
    const abstractParas = paragraphs.slice(abstractIdx + 1, endIdx);
    const abstractText = abstractParas.map(p => p.text).join(' ');
    const wordCount = abstractText.trim().split(/\s+/).filter(Boolean).length;
    
    return {
      detected: true,
      wordCount,
      paragraphIndices: abstractParas.map(p => p.index),
    };
  }

  // Find actual end: stop at next section heading
  let sectionEnd = abstractSection.endParagraphIndex;
  for (let j = abstractSection.startParagraphIndex + 1; j < sectionEnd; j++) {
    const pText = paragraphs[j].text.trim().toLowerCase();
    if (paragraphs[j].isHeading ||
        /^(chapter\s+\d|introduction|table\s+of\s+contents|acknowledgements?|vita|references|bibliography)$/i.test(pText)) {
      sectionEnd = j;
      break;
    }
  }
  const abstractParas = paragraphs.slice(
    abstractSection.startParagraphIndex + 1,
    sectionEnd
  );
  const abstractText = abstractParas.map(p => p.text).join(' ');
  const wordCount = abstractText.trim().split(/\s+/).filter(Boolean).length;

  return {
    detected: true,
    wordCount,
    topMargin: margins[0]?.top, // Would need section-specific margin for accuracy
    paragraphIndices: abstractParas.map(p => p.index),
  };
}

function parsePageNumbering(documentXml: string, footerXmls: string[]): PageNumberingInfo {
  // Check for page numbering format declarations
  const hasRoman = /<w:pgNumType[^>]*w:fmt="lowerRoman"/.test(documentXml) ||
                   /<w:pgNumType[^>]*fmt="lowerRoman"/.test(documentXml);
  const hasArabic = /<w:pgNumType[^>]*w:fmt="decimal"/.test(documentXml) ||
                    !/<w:pgNumType/.test(documentXml); // default is Arabic

  // Check for start values
  const romanStart = /<w:pgNumType[^>]*w:start="3"/.test(documentXml);
  const arabicStart = /<w:pgNumType[^>]*w:start="1"/.test(documentXml);

  // Check footer XML files for page numbering presence and alignment
  const hasFooter = footerXmls.length > 0;
  const footerContent = footerXmls.join('');
  // Look for page number fields (w:fldChar + PAGE) or w:pgNum in footer content
  const hasPageNumInFooter = hasFooter && (
    /PAGE/.test(footerContent) ||
    /<w:pgNum/.test(footerContent) ||
    /<w:fldSimple[^>]*PAGE/.test(footerContent) ||
    /<w:instrText[^>]*>\s*PAGE\b/.test(footerContent)
  );
  const footerCentered = hasFooter && /<w:jc\s+w:val="center"/.test(footerContent);

  return {
    hasPrelimRoman: hasRoman,
    hasBodyArabic: hasArabic,
    romanStartsAtIii: romanStart,
    arabicStartsAtOne: arabicStart,
    pageNumbersAtBottom: hasPageNumInFooter || hasFooter,
    pageNumbersCentered: footerCentered,
  };
}

function parseReferences(paragraphs: ParagraphInfo[]): ReferenceInfo[] {
  const refIdx = paragraphs.findIndex(p =>
    /^(references|bibliography|works\s+cited)$/i.test(p.text.trim())
  );
  
  if (refIdx === -1) return [];

  const refs: ReferenceInfo[] = [];
  for (let i = refIdx + 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.text.trim().length === 0) continue;
    refs.push({
      index: refs.length,
      text: p.text,
      lineSpacing: p.lineSpacing,
      spaceAfter: p.spaceAfter,
      hasEtAl: /\bet\s+al\./i.test(p.text),
    });
  }
  
  return refs;
}
