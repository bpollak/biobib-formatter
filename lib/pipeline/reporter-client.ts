import { PDFDocument, rgb } from 'pdf-lib';
import { ValidationResults } from '../types';

const UCSD_NAVY: [number, number, number] = [24 / 255, 43 / 255, 73 / 255];
const UCSD_GOLD: [number, number, number] = [198 / 255, 146 / 255, 20 / 255];

export async function generateReportPDFClient(results: ValidationResults): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const fontSize = 12;
  const margin = 72;
  let y = page.getSize().height - margin;

  function ensureSpace(needed: number) {
    if (y < margin + needed) {
      page = pdfDoc.addPage([612, 792]);
      y = page.getSize().height - margin;
    }
  }

  // Header
  page.drawText('UCSD Dissertation Formatting Compliance Report', {
    x: margin, y, size: fontSize + 4, color: rgb(...UCSD_NAVY),
  });
  y -= 30;

  page.drawText(`Document: ${results.metadata.fileName}`, { x: margin, y, size: fontSize });
  y -= 20;
  page.drawText(`Type: ${results.metadata.type} | Degree: ${results.metadata.degreeType}`, { x: margin, y, size: fontSize });
  y -= 30;

  // Summary
  page.drawText('SUMMARY', { x: margin, y, size: fontSize + 2, color: rgb(...UCSD_GOLD) });
  y -= 20;

  const { total, passed, failed, warned, autoFixed } = results.summary;
  page.drawText(`Total Rules Checked: ${total}`, { x: margin, y, size: fontSize }); y -= 18;
  page.drawText(`Passed: ${passed}`, { x: margin, y, size: fontSize, color: rgb(0, 0.6, 0) }); y -= 18;
  page.drawText(`Failed: ${failed}`, { x: margin, y, size: fontSize, color: rgb(0.8, 0, 0) }); y -= 18;
  page.drawText(`Warnings: ${warned}`, { x: margin, y, size: fontSize, color: rgb(0.8, 0.4, 0) }); y -= 18;
  page.drawText(`Auto-Fixed: ${autoFixed}`, { x: margin, y, size: fontSize, color: rgb(0, 0.4, 0.8) }); y -= 18;
  page.drawText(`Overall Status: ${results.summary.overallStatus.toUpperCase()}`, {
    x: margin, y, size: fontSize,
    color: results.summary.overallStatus === 'pass'
      ? rgb(0, 0.6, 0)
      : results.summary.overallStatus === 'needs-attention'
      ? rgb(0.8, 0.4, 0)
      : rgb(0.8, 0, 0),
  });
  y -= 30;

  // Changelog
  if (results.changes.length > 0) {
    ensureSpace(40);
    page.drawText('CHANGES APPLIED (Auto-Fixes)', { x: margin, y, size: fontSize + 2, color: rgb(...UCSD_GOLD) });
    y -= 20;

    for (const change of results.changes.slice(0, 15)) {
      ensureSpace(30);
      // Truncate long descriptions to fit on page
      const desc = change.description.length > 80 ? change.description.slice(0, 77) + '...' : change.description;
      page.drawText(`- ${desc}`, { x: margin + 10, y, size: fontSize - 1 });
      y -= 16;
    }
    y -= 10;
  }

  // Manual Fixes
  if (results.manualFixes.length > 0) {
    ensureSpace(40);
    page.drawText('MANUAL FIXES REQUIRED', { x: margin, y, size: fontSize + 2, color: rgb(...UCSD_GOLD) });
    y -= 20;

    for (const fix of results.manualFixes.slice(0, 15)) {
      ensureSpace(50);
      page.drawText(`${fix.ruleId}: ${fix.title}`, {
        x: margin + 10, y, size: fontSize - 1, color: rgb(0.8, 0, 0),
      });
      y -= 14;
      const instr = fix.instruction.length > 90 ? fix.instruction.slice(0, 87) + '...' : fix.instruction;
      page.drawText(`  ${instr}`, { x: margin + 20, y, size: fontSize - 2 });
      y -= 16;
      if (fix.location) {
        const loc = fix.location.length > 80 ? fix.location.slice(0, 77) + '...' : fix.location;
        page.drawText(`  Location: ${loc}`, {
          x: margin + 20, y, size: fontSize - 2, color: rgb(0.4, 0.4, 0.4),
        });
        y -= 14;
      }
      y -= 6;
    }
  }

  return pdfDoc.save();
}
