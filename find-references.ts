import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { validateDocument } from './lib/pipeline/validator';
import { existsSync, readFileSync } from 'fs';

const testFiles = [
  './Copy of Cheng_Li_PhD dissertation.docx',
  './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft (1).docx',
  './Copy of West_Melanie Dissertation .docx'
];

for (const file of testFiles) {
  if (!existsSync(file)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  console.log(`\nTesting ${file}...`);
  const fileBuffer = readFileSync(file);
  console.log(`Loaded: ${fileBuffer.length} bytes`);

  (async () => {
    try {
      const docxFiles = await readDocxFiles(fileBuffer);
      const metadata = { type: 'dissertation' };
      const parsedDoc = await parseDocument(fileBuffer, metadata);
      const validationResults = validateDocument(parsedDoc);

      const ref001 = validationResults.find(r => r.ruleId === 'REF-001');
      if (ref001) {
        console.log(`  REF-001: ${ref001.passed ? '✓ PASS' : '✗ FAIL'} - ${ref001.message}`);
        if (ref001.passed) {
          console.log(`  -> Found references section in ${file}`);
          // We can break after first found, but let's continue to see all.
        }
      } else {
        console.log('  REF-001: NOT FOUND');
      }
    } catch (error) {
      console.error(`  Error processing ${file}:`, error.message);
    }
  })();
}

// Note: We are not waiting for the async operations to finish because we are just logging.
// For a real test, we would wait, but for simplicity, we'll just run and see the output.
// We'll add a delay to let the async operations complete.
setTimeout(() => {}, 1000);