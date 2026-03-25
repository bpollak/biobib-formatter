import JSZip from 'jszip';
import { DocumentModel, ChangeRecord } from '../types';
import {
  fixMargins,
  fixFontColors,
  fixFonts,
  fixBodySpacing,
  fixFirstLineIndent,
  fixHeadingItalics,
  fixReferenceSpacing
} from '../docx/writer';
import { allRules } from '../rules';

export async function applyAutoFixes(
  docBuffer: Buffer,
  doc: DocumentModel
): Promise<{ correctedBuffer: Buffer; changes: ChangeRecord[] }> {
  let currentBuffer = docBuffer;
  const allChanges: ChangeRecord[] = [];

  // Process each fixable rule
  for (const rule of allRules) {
    if (!rule.autoFixable || !rule.fix) continue;

    const result = rule.check(doc);
    if (result.status === 'fail') {
      try {
        // Apply the fix
        const { zip, documentXml, stylesXml } = await loadDocx(currentBuffer);
        
        let newDocXml = documentXml;
        let newStylesXml = stylesXml;
        
        // Special handling for different rule types
        if (rule.id.startsWith('MARGIN-')) {
          // Handle margin fixes - MARGIN-001 through MARGIN-005
          const targetMargins = {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
            footer: 720
          };
          
          if (rule.id === 'MARGIN-006') {
            // Abstract top margin - special case
            targetMargins.top = 3600;
          }
          
          newDocXml = fixMargins(documentXml, allChanges, targetMargins);
        } else if (rule.id === 'FONT-001' || rule.id === 'FONT-005') {
          // Font family and color fixes
          const { documentXml: fixedDoc, stylesXml: fixedStyles } = fixFonts(
            documentXml,
            stylesXml,
            ['Arial', 'Century Gothic', 'Helvetica', 'Times New Roman'],
            'Times New Roman',
            allChanges
          );
          newDocXml = fixedDoc;
          newStylesXml = fixedStyles;
          
          if (rule.id === 'FONT-005') {
            newDocXml = fixFontColors(newDocXml, allChanges);
          }
        } else if (rule.id === 'SPACE-001' || rule.id === 'ABSTRACT-004') {
          // Body spacing and abstract spacing fixes
          newDocXml = fixBodySpacing(documentXml, allChanges);
        } else if (rule.id === 'INDENT-001') {
          // First-line indent fix
          newDocXml = fixFirstLineIndent(documentXml, allChanges);
        } else if (rule.id === 'TEXT-001') {
          // Remove italics from headings
          newDocXml = fixHeadingItalics(documentXml, allChanges);
        } else if (rule.id === 'REF-002' || rule.id === 'REF-003') {
          // Reference spacing
          newDocXml = fixReferenceSpacing(documentXml, allChanges);
        }
        
        // Save the modified document
        currentBuffer = await saveDocx(zip, newDocXml, newStylesXml);
      } catch (error) {
        console.error(`Error applying fix for rule ${rule.id}:`, error);
        // Continue with other fixes even if one fails
      }
    }
  }

  return { correctedBuffer: currentBuffer, changes: allChanges };
}

async function loadDocx(buffer: Buffer): Promise<{ zip: JSZip; documentXml: string; stylesXml: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await (zip.file('word/document.xml')?.async('string') || Promise.resolve(''));
  const stylesXml = await (zip.file('word/styles.xml')?.async('string') || Promise.resolve(''));
  return { zip, documentXml, stylesXml };
}

async function saveDocx(zip: JSZip, documentXml: string, stylesXml?: string): Promise<Buffer> {
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
