# Bug Report -- Dissertation Formatting Agent QA

**Date:** 2026-03-27
**Evaluator:** Claude (automated QA)
**App URL:** https://dissertation-formatter.vercel.app
**Commit:** 94e7e03 (main)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 10 |
| Medium | 12 |
| Low | 8 |
| **Total** | **35** |

TypeScript compilation: **0 errors** (clean build)
Rule count: **58 implemented** (SPEC says 67 -- 9 missing: MARGIN-006, APPROVAL-001 through APPROVAL-004, and 4 others noted below)

---

## Critical Bugs

### C1. PDF Report writes to wrong page on overflow
**File:** `lib/pipeline/reporter.ts:75-87, 109-120`
**Description:** When content overflows to a new page, `pdfDoc.addPage()` creates a new page but subsequent `page.drawText()` calls still reference the *original* `page` variable -- not the newly created page. All overflow content is drawn off-screen on page 1 (negative Y coordinates) while page 2 remains blank.
**Impact:** Any document with many changes or manual fixes produces a corrupt/unreadable PDF report.
**Fix:** Assign `page = pdfDoc.addPage(...)` so subsequent draws target the new page.

### C2. Report PDF download always fails on Vercel (serverless session mismatch)
**File:** `app/results/page.tsx:135`, `app/api/download/[sessionId]/report/route.ts`
**Description:** The "Download Compliance Report (PDF)" button calls `GET /api/download/{sessionId}/report`, which looks up the session in the in-memory `session-store`. But the `/api/check` endpoint (used by the main page) is stateless and never stores results in the session store. On Vercel, each serverless function instance has its own memory, so the session is never found. The endpoint always returns 404.
**Impact:** Report PDF download is completely broken in production.
**Fix:** Either generate the PDF client-side from the results JSON stored in sessionStorage, or store results in the session and use the same instance (not possible on serverless). The `.docx` download works because it uses the base64 data from sessionStorage -- do the same for the PDF.

### C3. `fixReferenceSpacing()` is a no-op -- claims to fix but does nothing
**File:** `lib/docx/writer.ts:299-316`
**Description:** The function detects a references section but immediately returns `documentXml` unchanged. The comment says "for now, this is a detection-only fix in MVP." Yet rules REF-002 and REF-003 are marked `autoFixable: true` in the rules, and the fixer dispatches to this function on failure. The rules will report "auto-fixed" in results but no change was actually made.
**Impact:** Users get a false "auto-fixed" status for reference spacing rules. Their downloaded document is unchanged.
**Fix:** Either implement the fix or set `autoFixable: false` on REF-002 and REF-003.

### C4. 23 rules marked `autoFixable: true` have no working `fix()` implementation
**File:** `lib/rules/*.ts` (multiple files)
**Description:** These rules have `autoFixable: true` but their `fix()` methods either (a) return the buffer unchanged, (b) are missing entirely, or (c) are delegated to fixer.ts which only handles a subset. The fixer dispatches fixes based on rule ID prefix matching, but only handles: MARGIN-*, FONT-001, FONT-005, SPACE-001, ABSTRACT-004, INDENT-001, TEXT-001, REF-002, REF-003. Rules not in this list silently skip.

**Rules with broken/missing fixes:**
- `FONT-002` (size), `FONT-003` (consistency), `FONT-004` (size consistency), `FONT-006` (hyperlinks)
- `SPACE-002` (block quotes), `SPACE-003` (block quote indent)
- `PAGE-006` (centered page numbers)
- `TITLE-001` (university caps), `TITLE-007` (committee indent), `TITLE-008` (committee spacing)
- `ABSTRACT-003` (abstract top margin)
- `FIG-005` (caption formatting)
- `INDENT-002` (block paragraphs)
- `A11Y-005` (document language)

**Impact:** These rules report "auto-fixed" in results but the document is unchanged.

### C5. Margin fixer applies MARGIN-006 targets to ALL margin rules
**File:** `lib/pipeline/fixer.ts:35-50`
**Description:** When fixing MARGIN-006 (abstract top margin = 2.5"), the code sets `targetMargins.top = 3600` then calls `fixMargins()` which replaces ALL `<w:pgMar>` elements in the document. This means if MARGIN-006 fails, every section's top margin gets set to 2.5" instead of just the abstract section. Also, `fixMargins()` always records the change as `ruleId: 'MARGIN-001'` regardless of which margin rule triggered it.
**Impact:** Processing a document with a correct 1" body margin but wrong abstract margin would corrupt all body margins to 2.5".

---

## High Bugs

### H1. SPEC defines 67 rules but only 58 are implemented
**File:** `lib/rules/index.ts`, `SPEC.md`
**Description:** Missing rules:
- `MARGIN-006` (abstract top margin) -- referenced in fixer but no rule object exists
- `APPROVAL-001` through `APPROVAL-004` (approval page rules)
- `SPACE-004`, `SPACE-005` (footnote/caption spacing pass-through)
- `TEXT-002`, `TEXT-003` are implemented in `headings.ts` but `TEXT-002` duplicates `FONT-005` logic

### H2. Fixer re-parses and re-zips the docx for EVERY rule
**File:** `lib/pipeline/fixer.ts:22-87`
**Description:** The loop calls `loadDocx(currentBuffer)` inside every iteration, decompressing and recompressing the entire zip for each fixable rule. For a document with 10+ fixable rules, this means 10+ full zip round-trips.
**Impact:** Performance -- processing time scales linearly with number of fixes. Could cause timeouts on large documents (50MB limit) on Vercel's 120s max.

### H3. Session store doesn't work across Vercel serverless instances
**File:** `lib/session-store.ts`
**Description:** The in-memory `Map<string, ProcessingSession>` is process-local. On Vercel, `/api/upload`, `/api/validate`, `/api/status`, and `/api/download` may each run in different serverless function instances. Sessions created by `/api/upload` won't exist in the `/api/validate` instance.
**Impact:** The upload-then-validate flow (used by `/api/upload` + `/api/validate`) is broken on Vercel. The `/api/check` combined endpoint works because it does everything in one request.

### H4. `setInterval` cleanup timer leaks in serverless environment
**File:** `lib/session-store.ts:8-17`
**Description:** `setInterval()` runs a cleanup timer every 60 seconds. In a serverless environment, this timer either (a) never fires because the function instance is frozen between requests, or (b) prevents the function instance from being garbage collected. The `typeof setInterval !== 'undefined'` guard doesn't help -- it's always defined in Node.js.
**Impact:** Memory leak potential on long-running instances; no actual cleanup on serverless.

### H5. Parser table detection uses paragraph-level regex on wrong XML structure
**File:** `lib/pipeline/parser.ts:86-95`
**Description:** Tables (`<w:tbl>`) are top-level elements in document.xml, not children of `<w:p>` (paragraph) elements. The parser iterates over extracted paragraphs and checks each for `<w:tbl>`, but `extractParagraphs()` only matches `<w:p>...</w:p>`. Tables will never be found inside paragraph elements.
**Impact:** Tables are never detected. Rules FIG-003, FIG-004, FIG-007, FIG-008 always pass (no tables to check).

### H6. `extractParagraphs` regex misses self-closing or attribute-less paragraphs
**File:** `lib/docx/reader.ts:74`
**Description:** Regex `/<w:p[ >]([\s\S]*?)<\/w:p>/g` requires a space or `>` after `<w:p`. Paragraphs like `<w:p/>` (self-closing empty) are missed. Also, the lazy `[\s\S]*?` may fail on deeply nested XML.
**Impact:** Some paragraphs may not be parsed, causing inaccurate rule checks.

### H7. `isRunItalic` / `isRunBold` false positives on `<w:iCs>` and `<w:bCs>`
**File:** `lib/docx/reader.ts:186-195`
**Description:** The regex `/<w:i\s*\/>/.test(runXml)` also matches `<w:iCs/>` (complex-script italic) which is a different property. Same for bold matching `<w:bCs/>`.
**Impact:** Paragraphs with complex-script formatting are falsely flagged as italic/bold.

### H8. Page numbering detection is unreliable (heuristic)
**File:** `lib/pipeline/parser.ts:483-506`
**Description:** `parsePageNumbering` checks for footer content using `/<w:ftr/.test(documentXml)` but footer content is in separate files (`word/footer1.xml`, etc.), not in `document.xml`. The regex will never match. `footerCentered` checks for `<w:jc w:val="center">` anywhere in document.xml, which matches any centered paragraph, not just footers.
**Impact:** All 9 pagination rules (PAGE-001 through PAGE-009) produce unreliable results.

### H9. Animation step count mismatch
**File:** `app/page.tsx:101-107`
**Description:** `STEPS` has 13 items (indices 0-12) but the animation loop only goes from `i=1` to `i=11` (11 iterations with `stepDelays` having 11 entries). Steps 12 ("Generating compliance report") is animated separately at line 121, but step 0 is advanced before the loop starts. The progress calculation `5 + (i * 6)` maxes at 71%, then jumps to 95%.
**Impact:** Minor UX -- progress bar is not smooth. Step 11 ("Applying auto-fixes") may appear to stall.

### H10. Validator runs `rule.check()` even for skipped rules
**File:** `lib/pipeline/validator.ts:9-24`
**Description:** When a rule doesn't apply (e.g., thesis-only rule on a dissertation), the code still calls `rule.check(doc)` to get the base result object, then overrides the status to 'skipped'. This wastes CPU and could throw errors if the check assumes the document type.
**Impact:** Wasted processing; potential for unexpected errors on type-specific rules.

---

## Medium Bugs

### M1. Font check includes style-defined fonts (false positives)
**File:** `lib/pipeline/parser.ts:190-195`
**Description:** The parser collects ALL font references from `styles.xml` (including built-in styles like "Normal", "Heading", etc.) and adds them to `doc.styles.fonts`. Many Word templates include fonts like "Calibri Light", "Cambria", etc. in default styles that aren't actually used in the document text. FONT-001 then flags these as unapproved.
**Impact:** False failures for FONT-001 on virtually every real document.

### M2. `fixMargins` only fixes margins smaller than target, not equal
**File:** `lib/docx/writer.ts:50-55`
**Description:** The `needsFix` check uses `<` comparisons (`topVal < targetMargins.top`) but for the footer it checks `!==`. A margin of exactly 1440 twips won't be "fixed" even when the rule spec says ">= 1 inch". This is actually correct for >= requirements, but the footer check is inconsistent -- it replaces any footer value that isn't exactly 720.
**Impact:** Minor inconsistency; footer margins may be unnecessarily modified.

### M3. `fixBodySpacing` removes `lineRule` attribute
**File:** `lib/docx/writer.ts:183-186`
**Description:** The spacing fix replaces `w:lineRule="[^"]*"` with empty string. This removes the `lineRule` attribute entirely, which changes the spacing interpretation. Without `lineRule`, Word defaults to "auto" (proportional), but the original might have been "exact" or "atLeast".
**Impact:** Some paragraphs may render with different spacing than intended.

### M4. `fixFirstLineIndent` breaks self-closing `<w:ind/>` elements
**File:** `lib/docx/writer.ts:239`
**Description:** When adding `firstLine` to an existing `<w:ind/>` element, the code does `indMatch[0].replace('>', ' w:firstLine="720">')`. For self-closing `<w:ind w:left="0"/>`, this produces `<w:ind w:left="0"/ w:firstLine="720">` which is malformed XML.
**Impact:** Corrupted document XML after auto-fix, potentially unreadable by Word.

### M5. Abstract word count includes heading text
**File:** `lib/pipeline/parser.ts:457-459, 468-472`
**Description:** `parseAbstract` starts at `abstractSection.startParagraphIndex + 1` which is correct for skipping the heading. But when falling back to text search (line 457), it includes 20 paragraphs after the "Abstract" heading, which may extend into the next section (e.g., body text). There's no end boundary detection.
**Impact:** Abstract word count may be inflated, causing false failures for ABSTRACT-001/002.

### M6. Section detection creates overlapping ranges
**File:** `lib/pipeline/parser.ts:257-376`
**Description:** `detectSections` doesn't track which paragraphs have already been assigned to a section. Multiple sections can claim the same paragraph indices. For example, a blank paragraph (line 279) creates a copyright section AND may also be included in the title section (line 266).
**Impact:** Rules that use section boundaries may check the wrong paragraphs.

### M7. Copyright section detection is too aggressive
**File:** `lib/pipeline/parser.ts:278-287`
**Description:** Any empty paragraph in the first 10 paragraphs (`paragraphs[i].isEmpty && i < 10`) triggers a copyright section detection. Most documents have empty paragraphs near the beginning.
**Impact:** False detection of copyright section; may confuse page order rules.

### M8. `dominantSize` parsed as integer from string key
**File:** `lib/pipeline/parser.ts:209`
**Description:** `parseInt(Object.entries(sizeFreq).sort(...)` converts the frequency map key (originally a number) back from string. `Object.entries()` converts number keys to strings, then `parseInt` converts back. This works but `parseFloat` would be safer since half-point sizes are integers anyway.
**Impact:** Negligible -- works correctly but fragile.

### M9. Heading italic fix regex is too specific
**File:** `lib/docx/writer.ts:270`
**Description:** The regex requires `<w:pStyle w:val="Heading..."` to appear exactly within `<w:pPr>` in a specific order. If other properties come before `pStyle` in the `pPr` block, the regex won't match.
**Impact:** Some italic headings won't be fixed.

### M10. `getSpacing` returns undefined for 0 values
**File:** `lib/docx/reader.ts:135-136`
**Description:** `parseInt('0') || undefined` evaluates to `undefined` because `0` is falsy. A paragraph with explicit `w:before="0"` or `w:after="0"` returns undefined, which is indistinguishable from "not specified".
**Impact:** Rules checking for explicit spacing values may misinterpret zero-spacing as unset.

### M11. `getAttr` regex escaping is incomplete
**File:** `lib/docx/reader.ts:273`
**Description:** `attr.replace(':', '\\:')` only escapes colons, but the attribute name is used in a regex constructor. If any attribute name contains other regex-special characters, the pattern breaks.
**Impact:** Low risk since all attribute names are well-known, but fragile.

### M12. Large base64 strings in sessionStorage
**File:** `app/page.tsx:132`
**Description:** The corrected file (up to 50MB) is base64-encoded and stored in `sessionStorage`. Base64 adds ~33% overhead, so a 50MB file becomes ~67MB in sessionStorage. Most browsers limit sessionStorage to 5-10MB.
**Impact:** Large documents will fail silently -- `sessionStorage.setItem` throws a quota error, the corrected file is lost, and the download button shows "Corrected file not available."

---

## Low Bugs

### L1. Duplicate old/new component structure
**Files:** `components/Header.tsx` + `components/layout/AppHeader.tsx`, `components/Footer.tsx` + `components/layout/AppFooter.tsx`, `components/UploadZone.tsx` + `components/upload/UploadZone.tsx`
**Description:** Two parallel component hierarchies exist. The app uses the old top-level components (`Header.tsx`, `Footer.tsx`, etc.) while the `layout/` and `upload/` subdirectories contain newer versions that are unused.
**Impact:** Dead code; maintenance confusion.

### L2. `useEffect` missing `router` dependency
**File:** `app/results/page.tsx:84-105`
**Description:** The `useEffect` depends on `[sessionId]` but doesn't include `router` in the dependency array. This is safe in practice since `router` is stable, but triggers ESLint warnings.

### L3. Processing view `about` page is bare
**File:** `app/about/page.tsx`
**Description:** If this page exists, it should provide useful content about the tool, GEPA requirements, etc. Currently just a placeholder.

### L4. External UCSD logo images have no local fallback
**File:** `components/Header.tsx`
**Description:** Logos load from `ucsd.edu` CDN. If the CDN is slow or blocked, the header renders without branding. Error handlers use `innerHTML` to inject text fallbacks.

### L5. No file size feedback before upload
**Description:** If a user selects a file close to the 50MB limit, there's no warning. The size check only happens server-side after a potentially long upload.

### L6. `alert()` used for download errors
**File:** `app/results/page.tsx:151`
**Description:** Uses browser `alert()` instead of a proper UI component for error messages. Inconsistent with the rest of the app which uses MUI `Alert`.

### L7. Unused `autoFixDocument` export in validator
**File:** `lib/pipeline/validator.ts:32-35`
**Description:** `autoFixDocument` is defined but never imported anywhere. It's a stub that returns the buffer unchanged.

### L8. Process animation sets progress to `5 + (11 * 6) = 71` then jumps to 95
**File:** `app/page.tsx:105, 123`
**Description:** Progress jumps from 71% to 95% when the animation completes and the report generation step begins. Not smooth.

---

## Architectural Concerns (Not Bugs)

1. **No input sanitization on XML manipulation** -- All fixes use regex on raw XML. A malformed .docx could produce unpredictable results or regex catastrophic backtracking (ReDoS).

2. **No concurrent upload protection** -- Multiple users uploading simultaneously on the same serverless instance could cause memory pressure since buffers up to 50MB are held in memory.

3. **No CSRF protection** on API routes -- POST endpoints accept any origin. Acceptable for MVP but should be addressed before production.

4. **No rate limiting** -- A user could spam uploads and exhaust Vercel function execution time.

5. **Session cleanup interval is moot** on Vercel serverless since function instances are ephemeral.

---

## Recommended Priority Fixes

1. **C2** (PDF download broken on Vercel) -- Generate PDF client-side or return it inline with `/api/check` response
2. **C1** (PDF page overflow) -- Fix the `page` variable reference
3. **C4/C3** (false auto-fixed status) -- Mark non-implemented rules as `autoFixable: false`
4. **C5** (margin corruption) -- Scope MARGIN-006 fix to abstract section only
5. **H5** (table detection) -- Parse tables from document-level XML, not paragraphs
6. **H8** (pagination detection) -- Read footer XML files properly
7. **M4** (XML corruption) -- Fix self-closing element handling in indent fixer
8. **M12** (sessionStorage quota) -- Stream large files or use a temporary download URL
