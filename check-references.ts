import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { existsSync, readFileSync } from 'fs';

const testFiles = [
  './Copy of Cheng_Li_PhD dissertation.docx',
  './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft (1).docx',
  './Copy of West_Melanie Dissertation .docx'
];

async function checkFile(file: string) {
  if (!existsSync(file)) {
    console.log(`File not found: ${file}`);
    return null;
  }

  const fileBuffer = readFileSync(file);
  try {
    const docxFiles = await readDocxFiles(fileBuffer);
    const metadata = {
      type: 'dissertation',
      degreeType: 'doctoral',
      fileName: file,
      fileSize: fileBuffer.length
    };
    const parsedDoc = await parseDocument(fileBuffer, metadata);
    
    // Check for references section in paragraphs
    const refIdx = parsedDoc.paragraphs.findIndex(p =>
      /^(references|bibliography|works\s+cited)$/i.test(p.text.trim())
    );
    
    // Also check sections
    const refSection = parsedDoc.sections.find(s => s.type === 'references');
    
    return {
      file,
      paragraphsLength: parsedDoc.paragraphs.length,
      sectionsLength: parsedDoc.sections.length,
      refIdx,
      refSectionExists: refSection !== undefined,
      refSectionDetected: refSection?.detected ?? false,
      referencesCount: parsedDoc.references.length,
      refSection: refSection
    };
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
    return null;
  }
}

(async () => {
  console.log('Checking for references section in dissertation files...\n');
  for (const file of testFiles) {
    const result = await checkFile(file);
    if (result === null) continue;
    
    console.log(`File: ${result.file}`);
    console.log(`  Paragraphs: ${result.paragraphsLength}`);
    console.log(`  Sections: ${result.sectionsLength}`);
    console.log(`  References section index in paragraphs: ${result.refIdx !== -1 ? result.refIdx : 'not found'}`);
    console.log(`  References section in sections: ${result.refSectionExists} (detected: ${result.refSectionDetected})`);
    console.log(`  Reference entries parsed: ${result.referencesCount}`);
    if (result.refSection) {
      console.log(`    Section details: start=${result.refSection.startParagraphIndex}, end=${result.refSection.endParagraphIndex}, confidence=${result.refSection.confidence}`);
    }
    console.log('');
  }
})();