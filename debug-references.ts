import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { existsSync, readFileSync } from 'fs';

const testFile = './Copy of Cheng_Li_PhD dissertation.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Debugging references in: ${testFile}`);

// Read the document
const fileBuffer = readFileSync(testFile);
console.log(`Loaded file: ${fileBuffer.length} bytes`);

(async () => {
  try {
    // Read DOCX files
    const docxFiles = await readDocxFiles(fileBuffer);
    console.log('✓ DOCX files read successfully');
    
    // Parse document - need metadata
    const metadata = {
      type: 'dissertation',
      degreeType: 'doctoral',
      fileName: 'test.docx',
      fileSize: fileBuffer.length
    };
    const parsedDoc = await parseDocument(fileBuffer, metadata);
    console.log(`✓ Document parsed: ${parsedDoc.sections.length} sections, ${parsedDoc.paragraphs.length} paragraphs`);
    
    // Look for references section in paragraphs
    console.log('\nSearching for references section in paragraphs...');
    const refIndices = [];
    for (let i = 0; i < parsedDoc.paragraphs.length; i++) {
      const p = parsedDoc.paragraphs[i];
      const text = p.text.trim();
      if (/^(references|bibliography|works\s+cited)$/i.test(text)) {
        refIndices.push(i);
        console.log(`  Found at index ${i}: "${text}"`);
      }
    }
    
    if (refIndices.length === 0) {
      console.log('  No exact matches found. Looking for partial matches...');
      for (let i = 0; i < parsedDoc.paragraphs.length; i++) {
        const p = parsedDoc.paragraphs[i];
        const text = p.text.trim().toLowerCase();
        if (text.includes('references') || text.includes('bibliography') || text.includes('works cited')) {
          refIndices.push(i);
          console.log(`  Partial match at index ${i}: "${text}"`);
        }
      }
    }
    
    // Look at sections
    console.log('\nChecking sections...');
    const refSections = parsedDoc.sections.filter(s => s.type === 'references');
    console.log(`  Found ${refSections.length} reference sections in sections`);
    refSections.forEach((s, idx) => {
      console.log(`    Section ${idx}: start=${s.startParagraphIndex}, end=${s.endParagraphIndex}, detected=${s.detected}, confidence=${s.confidence}`);
    });
    
    // Show some paragraphs around where references might be
    console.log('\nSample paragraphs from end of document (last 20):');
    const startIdx = Math.max(0, parsedDoc.paragraphs.length - 20);
    for (let i = startIdx; i < parsedDoc.paragraphs.length; i++) {
      const p = parsedDoc.paragraphs[i];
      console.log(`  [${i}] "${p.text.substring(0, 100)}${p.text.length > 100 ? '...' : ''}"`);
    }
    
    // Check what's actually in the references array from parser
    console.log(`\nReferences found by parser: ${parsedDoc.references.length}`);
    if (parsedDoc.references.length > 0) {
      console.log('  First few references:');
      for (let i = 0; i < Math.min(5, parsedDoc.references.length); i++) {
        const ref = parsedDoc.references[i];
        console.log(`    [${i}] "${ref.text.substring(0, 100)}${ref.text.length > 100 ? '...' : ''}" (lineSpacing: ${ref.lineSpacing}, spaceAfter: ${ref.spaceAfter})`);
      }
    } else {
      console.log('  No references found by parser.');
    }
    
  } catch (error) {
    console.error('❌ Error during debugging:', error);
    process.exit(1);
  }
})();