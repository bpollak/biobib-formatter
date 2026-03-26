# SPEC.md — Dissertation Formatting Agent Architecture

*Architect: Henry | Date: March 25, 2026*
*Project: UCSD GEPA Dissertation Formatting Agent*

---

## 1. Architecture Overview

**Stack:** Next.js 15 (App Router) + TypeScript + Material UI (MUI)
**Pattern:** Stateless file-in → process → file-out. No database for MVP.
**Deployment:** Vercel via GitHub auto-deploy
**Data Tier:** P2 (Internal) — documents processed in-memory, not persisted

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│  Upload Screen → Processing Screen → Results Screen │
└────────────────────────┬────────────────────────────┘
                         │ POST /api/upload (multipart)
                         ▼
┌─────────────────────────────────────────────────────┐
│                  Next.js API Routes                  │
│                                                      │
│  /api/upload → /api/validate → /api/format →        │
│  /api/report → /api/download                        │
└────────────────────────┬────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌───────────┐ ┌────────────┐
   │ mammoth.js │ │ docx (npm)│ │  pdf-lib    │
   │ Parse .docx│ │ Write .docx│ │ Gen report │
   └────────────┘ └───────────┘ └────────────┘
```

**Key design decisions:**
- Stateless — no database, no user accounts for MVP. Each upload is independent.
- Server-side processing — all document parsing/validation happens in Next.js API routes (not client-side).
- Session storage via browser `sessionStorage` for resubmit flow (previous results JSON).
- Files held in memory during processing, streamed to client, then discarded.

---

## 2. Core Processing Pipeline

### Pipeline Stages

```
Upload → Parse → Validate → Auto-Fix → Report → Download
```

#### Stage 1: Upload Handler
- Accept `.docx` files only (MVP)
- Max file size: 50MB
- Multipart form upload with metadata: document type (dissertation/thesis), degree type (doctoral/master's)
- Server receives file as `Buffer` — no disk persistence
- Returns a processing session ID (UUID) for status tracking

#### Stage 2: Document Parser (mammoth.js)
- Extract document as structured HTML + raw text
- Parse `.docx` XML directly (via `JSZip`) for properties not exposed by mammoth:
  - Page margins from `word/document.xml` → `<w:pgMar>`
  - Font declarations from `word/styles.xml` and run properties
  - Paragraph spacing from `<w:spacing>`
  - Page numbering from `<w:pgNumType>` and `<w:fldChar>`/`<w:fldSimple>`
  - Section breaks from `<w:sectPr>`
- Build an internal **Document Model**:

```typescript
interface DocumentModel {
  metadata: {
    type: 'dissertation' | 'thesis';
    degreeType: 'doctoral' | 'masters';
    fileName: string;
    fileSize: number;
  };
  pages: PageInfo[];          // Ordered list of detected pages
  sections: SectionInfo[];    // Logical sections (title, abstract, body, etc.)
  styles: StyleInfo;          // Fonts, sizes, colors found
  margins: MarginInfo;        // Per-section margins
  paragraphs: ParagraphInfo[];// All paragraphs with formatting
  figures: FigureInfo[];      // Figures with captions
  tables: TableInfo[];        // Tables with captions
  references: ReferenceInfo[];// Bibliography entries
  titlePage: TitlePageInfo;   // Parsed title page structure
  abstractText: string;       // Raw abstract text for word count
  pageNumbering: PageNumberingInfo;
}
```

#### Stage 3: Formatting Validator (Rule Engine)
- Iterate through all rules (see §3)
- Each rule receives the `DocumentModel` and returns:

```typescript
interface RuleResult {
  ruleId: string;
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  message: string;           // Human-readable explanation
  details?: string;          // Specific location/context
  autoFixable: boolean;      // Can this be auto-corrected?
  severity: 'critical' | 'major' | 'minor';
}
```

#### Stage 4: Auto-Formatter
- For each failed rule where `autoFixable: true`, apply the fix
- Operate on the raw `.docx` XML (via JSZip) for structural changes
- Use the `docx` npm package for generating replacement sections if needed
- Track every change applied:

```typescript
interface ChangeRecord {
  ruleId: string;
  description: string;       // "Changed left margin from 0.75" to 1.0""
  location: string;          // "Section 1, paragraph 3"
  before: string;            // Previous value
  after: string;             // New value
}
```

#### Stage 5: Report Generator
- Produce a compliance report as structured JSON → rendered as PDF via `pdf-lib`
- Report includes:
  - Overall pass/fail status
  - Per-rule checklist with status icons
  - Changelog of all auto-applied fixes
  - Manual fix instructions for non-auto-fixable issues
  - UCSD GEPA branding (logo, colors)

#### Stage 6: Download Handler
- Return two files:
  1. Corrected `.docx` (with auto-fixes applied)
  2. Compliance report (PDF)
- Served as downloadable blobs from the API

---

## 3. Formatting Rules Engine

Every rule is a structured object implementing this interface:

```typescript
interface FormattingRule {
  id: string;                        // e.g., "MARGIN-001"
  category: RuleCategory;
  name: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  autoFixable: boolean;
  appliesTo: 'all' | 'dissertation' | 'thesis';
  check: (doc: DocumentModel) => RuleResult;
  fix?: (docBuffer: Buffer, doc: DocumentModel) => Buffer;
}

type RuleCategory =
  | 'margins'
  | 'fonts'
  | 'pagination'
  | 'page-order'
  | 'title-page'
  | 'approval-page'
  | 'abstract'
  | 'spacing'
  | 'indentation'
  | 'figures-tables'
  | 'references'
  | 'text-formatting'
  | 'accessibility';
```

### 3.1 Margins

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `MARGIN-001` | Left margin ≥ 1" | `pgMar.left >= 1440 twips` | ✅ Set to 1440 | critical |
| `MARGIN-002` | Right margin ≥ 1" | `pgMar.right >= 1440 twips` | ✅ Set to 1440 | critical |
| `MARGIN-003` | Top margin ≥ 1" | `pgMar.top >= 1440 twips` | ✅ Set to 1440 | critical |
| `MARGIN-004` | Bottom margin ≥ 1" | `pgMar.bottom >= 1440 twips` | ✅ Set to 1440 | critical |
| `MARGIN-005` | Page numbers 0.5" from bottom | `pgMar.footer = 720 twips` | ✅ Set to 720 | major |
| `MARGIN-006` | Abstract top margin 2.5" | First section of abstract: `pgMar.top = 3600 twips` | ✅ Set to 3600 | major |

### 3.2 Fonts

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `FONT-001` | Approved font family | Font ∈ {Arial, Century Gothic, Helvetica, Times New Roman} | ✅ Replace with Times New Roman | critical |
| `FONT-002` | Font size 10-12pt | All run sizes ∈ {20, 22, 24 half-points} | ✅ Set to 24 (12pt) | critical |
| `FONT-003` | Consistent font throughout | Single font family used across all body text | ✅ Normalize to most-used | major |
| `FONT-004` | Consistent size throughout | Single font size used across all body text | ✅ Normalize to most-used | major |
| `FONT-005` | All text black | All run colors = `000000` or `auto` | ✅ Set color to auto/black | critical |
| `FONT-006` | No colored hyperlinks | Hyperlink styles use black, no underline color | ✅ Override link styles | major |

### 3.3 Pagination

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `PAGE-001` | Title page = page i (not printed) | First page has no visible page number | ❌ Manual | critical |
| `PAGE-002` | Blank/copyright page = page ii (not printed) | Second page has no visible page number | ❌ Manual | critical |
| `PAGE-003` | Approval page numbered iii | Third page shows "iii" | ❌ Manual | critical |
| `PAGE-004` | Prelim pages use lowercase Roman numerals | Pages iii through end of prelim use Roman | ❌ Manual | critical |
| `PAGE-005` | Body pages start at Arabic 1 | First body page numbered "1" | ❌ Manual | critical |
| `PAGE-006` | Page numbers centered at bottom | Footer alignment = center | ✅ Set center alignment | major |
| `PAGE-007` | No missing page numbers | Sequential check, no gaps | ❌ Manual (flag) | critical |
| `PAGE-008` | No duplicate page numbers | No repeated numbers detected | ❌ Manual (flag) | critical |
| `PAGE-009` | No blank numbered pages | Every numbered page has content | ❌ Manual (flag) | major |

### 3.4 Page Order

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `ORDER-001` | Title page is first | Section detection: title page at position 0 | ❌ Manual | critical |
| `ORDER-002` | Blank/copyright page second | Position 1 is blank or copyright notice | ❌ Manual | critical |
| `ORDER-003` | Approval page third | Position 2 is approval page | ❌ Manual | critical |
| `ORDER-004` | Optional prelim pages in correct zone | Dedication, epigraph between approval and TOC | ❌ Manual (flag) | major |
| `ORDER-005` | TOC present and correctly placed | TOC exists after approval/optional prelim | ❌ Manual (flag) | critical |
| `ORDER-006` | Acknowledgements present | Acknowledgements section detected | ❌ Manual (flag) | critical |
| `ORDER-007` | Vita present (doctoral only) | Vita section detected before abstract | ❌ Manual (flag) | critical |
| `ORDER-008` | Abstract present and correctly placed | Abstract after vita (doctoral) or acknowledgements (masters) | ❌ Manual (flag) | critical |
| `ORDER-009` | Body follows abstract | Main chapters after abstract | ❌ Manual (flag) | critical |
| `ORDER-010` | References last | References/bibliography at end | ❌ Manual (flag) | critical |
| `ORDER-011` | Appendices before references | If appendices exist, they precede references | ❌ Manual (flag) | major |
| `ORDER-012` | List of Figures/Tables if applicable | If figures/tables exist, corresponding list exists in prelim | ❌ Manual (flag) | major |

### 3.5 Title Page

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `TITLE-001` | University name in all caps | Text contains "UNIVERSITY OF CALIFORNIA SAN DIEGO" | ✅ Capitalize | critical |
| `TITLE-002` | Title is descriptive (no symbols/formulas) | Warn if Greek letters, formulas, or special symbols detected | ❌ Manual (flag) | major |
| `TITLE-003` | "in" lowercase on own line | Line containing only "in" (case-insensitive check) | ❌ Manual (flag) | minor |
| `TITLE-004` | "by" lowercase on own line | Line containing only "by" (case-insensitive check) | ❌ Manual (flag) | minor |
| `TITLE-005` | Committee chair listed first | First committee member has "Chair" designation | ❌ Manual (flag) | major |
| `TITLE-006` | Committee members alphabetized | Members after chair sorted alphabetically by last name | ❌ Manual (flag) | major |
| `TITLE-007` | Committee list indented 0.5" | Paragraph indent = 720 twips from "Committee in Charge" | ✅ Set indent | major |
| `TITLE-008` | Committee list single-spaced | Line spacing = single (240 twips) | ✅ Set spacing | major |
| `TITLE-009` | Year matches conferral year | Warn — cannot auto-verify, flag for review | ❌ Manual (flag) | minor |

### 3.6 Approval Page

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `APPROVAL-001` | No header on approval page | No header content on page iii | ✅ Remove header | major |
| `APPROVAL-002` | Top text left or fully justified | Paragraph alignment = left or justify | ✅ Set alignment | major |
| `APPROVAL-003` | Bottom text centered | Bottom paragraph alignment = center | ✅ Set alignment | major |
| `APPROVAL-004` | No signatures present | No image elements or signature-like content | ❌ Manual (flag) | minor |

### 3.7 Abstract

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `ABSTRACT-001` | Word count ≤ 350 (doctoral) | Count words in abstract section | ❌ Manual (flag) | critical |
| `ABSTRACT-002` | Word count ≤ 250 (master's) | Count words in abstract section | ❌ Manual (flag) | critical |
| `ABSTRACT-003` | Top margin 2.5" | Abstract section top margin = 3600 twips | ✅ Set margin | major |
| `ABSTRACT-004` | Double-spaced | Line spacing = double (480 twips) | ✅ Set spacing | major |

### 3.8 Spacing

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `SPACE-001` | Body text double-spaced | Body paragraphs: line spacing = 480 twips (double) | ✅ Set to double | critical |
| `SPACE-002` | Block quotes single-spaced | Quotes ≥ 6 lines: line spacing = 240 twips | ✅ Set to single | major |
| `SPACE-003` | Block quotes indented 0.5" L and R | Left + right indent = 720 twips | ✅ Set indent | major |
| `SPACE-004` | Footnotes single-spaced OK | Footnotes at 240 twips — no flag | ✅ (pass-through) | minor |
| `SPACE-005` | Figure/table captions single-spaced OK | Caption paragraphs at 240 twips — no flag | ✅ (pass-through) | minor |

### 3.9 Indentation

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `INDENT-001` | First line indent 0.5" | Body paragraphs: `firstLine = 720 twips` | ✅ Set indent | critical |
| `INDENT-002` | No block-style paragraphs | No body paragraphs with 0 indent + extra space between | ✅ Add first-line indent | major |

### 3.10 Figures & Tables

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `FIG-001` | All figures have captions | Every `<w:drawing>` has associated caption paragraph | ❌ Manual (flag) | critical |
| `FIG-002` | Figure captions below figure | Caption paragraph follows drawing element | ❌ Manual (flag) | major |
| `FIG-003` | All tables have captions | Every `<w:tbl>` has associated caption paragraph | ❌ Manual (flag) | critical |
| `FIG-004` | Table captions above table | Caption paragraph precedes table element | ❌ Manual (flag) | major |
| `FIG-005` | Consistent caption formatting | All captions use same style/font/size | ✅ Normalize styles | major |
| `FIG-006` | Full-page items have facing captions | If figure/table fills page, caption on facing page | ❌ Manual (flag) | major |
| `FIG-007` | Multi-page tables repeat headers | Table rows marked as header repeat | ❌ Manual (flag) | major |
| `FIG-008` | Multi-page continuation captions | ", Continued" appended to repeated captions | ❌ Manual (flag) | major |

### 3.11 References

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `REF-001` | References section exists | Bibliography/references section detected | ❌ Manual (flag) | critical |
| `REF-002` | Single-spaced within entries | Reference paragraphs: line spacing = 240 twips | ✅ Set spacing | major |
| `REF-003` | Double-space between entries | Space after each reference paragraph = 240 twips | ✅ Set spacing | major |
| `REF-004` | No "et al." in bibliography | Text search for "et al." in reference entries | ❌ Manual (flag) | critical |
| `REF-005` | All authors listed | Heuristic: flag entries with "et al.", "and others" | ❌ Manual (flag) | critical |
| `REF-006` | Consistent formatting | All entries follow same citation style pattern | ❌ Manual (flag) | major |

### 3.12 Text Formatting

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `TEXT-001` | No italics in headings | Heading styles: `<w:i>` not present (unless MLA) | ✅ Remove italic | major |
| `TEXT-002` | No colored text anywhere | All `<w:color>` values = 000000 or auto | ✅ Set to black | critical |
| `TEXT-003` | No colored hyperlinks | Hyperlink character styles use black | ✅ Override color | major |

### 3.13 Accessibility (Phase 2 — flagged only in MVP)

| Rule ID | Name | Check | Auto-Fix | Severity |
|---------|------|-------|----------|----------|
| `A11Y-001` | Heading styles used (not just bold/size) | Headings use `Heading 1`, `Heading 2`, etc. styles | ❌ Phase 2 | major |
| `A11Y-002` | Images have alt-text | `<w:drawing>` elements have `descr` attribute | ❌ Phase 2 (flag) | major |
| `A11Y-003` | Table headers marked | First row of tables marked as header | ❌ Phase 2 (flag) | major |
| `A11Y-004` | Color contrast sufficient | Text/background contrast ≥ 4.5:1 | ❌ Phase 2 (flag) | major |
| `A11Y-005` | Document language set | `<w:lang>` defined in document properties | ✅ Set to en-US | minor |
| `A11Y-006` | Logical reading order | Heading hierarchy is sequential (no skipped levels) | ❌ Phase 2 (flag) | major |

**Total Rules: 67** (48 MVP-active, 6 accessibility Phase 2 flags, 13 informational/pass-through)

---

## 4. UI Screens

### 4.1 Upload Screen (`/`)
- UCSD-branded header with GEPA logo
- Drag-and-drop zone with file picker fallback
- File type restriction: `.docx` only, max 50MB
- Form fields:
  - Document type: `Dissertation` | `Thesis` (radio)
  - Degree type: `Doctoral` | `Master's` (radio)
- "Check Formatting" primary action button
- Help link → GEPA formatting manual
- Previous results banner if `sessionStorage` has prior results

### 4.2 Processing Screen (`/processing`)
- Animated progress bar
- Live checklist showing rule categories being checked:
  - ☐ Parsing document structure...
  - ☐ Checking margins...
  - ☐ Checking fonts...
  - ☐ Checking pagination...
  - ☐ Checking page order...
  - ☐ Checking title page...
  - ☐ Checking abstract...
  - ☐ Checking spacing & indentation...
  - ☐ Checking figures & tables...
  - ☐ Checking references...
  - ☐ Applying auto-fixes...
  - ☐ Generating report...
- Each item transitions ☐ → ⏳ → ✅/❌
- Cancel button

### 4.3 Results Screen (`/results`)
- **Summary card**: Overall status (PASS / NEEDS ATTENTION / FAIL), total rules checked, passed, failed
- **Compliance checklist**: Expandable accordion by category
  - Each rule shows: ✅ Pass | ❌ Fail | ⚠️ Warning | 🔧 Auto-fixed
  - Failed rules show specific guidance text
  - Auto-fixed rules show before/after
- **Changelog section**: List of all auto-applied changes with descriptions
- **Manual fixes section**: Numbered list of required manual edits with specific instructions
- **Download buttons**:
  - "Download Corrected Document" (.docx)
  - "Download Compliance Report" (.pdf)
- **Resubmit button**: "Upload Revised Document" → returns to Upload Screen with comparison mode enabled

### 4.4 Resubmit Flow
- Upload screen shows "Resubmission Mode" banner
- After processing, Results screen shows side-by-side:
  - Previous submission: X passed, Y failed
  - Current submission: X passed, Y failed
  - Delta: "3 issues resolved, 1 new issue"
- Visual diff highlighting which rules changed status

---

## 5. API Routes

All routes under `/api/` using Next.js App Router Route Handlers.

| Method | Route | Purpose | Input | Output |
|--------|-------|---------|-------|--------|
| `POST` | `/api/upload` | Receive .docx file + metadata | `multipart/form-data` (file + type + degree) | `{ sessionId, status: 'processing' }` |
| `GET` | `/api/status/[sessionId]` | Poll processing progress | URL param | `{ stage, progress, completedRules[] }` |
| `GET` | `/api/results/[sessionId]` | Get full validation results | URL param | `{ summary, rules[], changes[], manualFixes[] }` |
| `GET` | `/api/download/[sessionId]/document` | Download corrected .docx | URL param | `.docx` binary stream |
| `GET` | `/api/download/[sessionId]/report` | Download compliance report | URL param | `.pdf` binary stream |

### Processing Flow (Server-Side)

```
POST /api/upload
  → Validate file (type, size)
  → Store in memory Map<sessionId, ProcessingSession>
  → Kick off async pipeline
  → Return sessionId immediately

GET /api/status/[sessionId]  (polled by client every 2s)
  → Return current pipeline stage + progress

GET /api/results/[sessionId]  (when status = 'complete')
  → Return full results JSON

GET /api/download/[sessionId]/document
  → Stream corrected .docx from memory
  → Delete session after download (or TTL expiry)

GET /api/download/[sessionId]/report
  → Generate PDF on-demand from results JSON
  → Stream to client
```

### In-Memory Session Store

```typescript
const sessions = new Map<string, ProcessingSession>();

interface ProcessingSession {
  id: string;
  createdAt: number;
  status: 'uploading' | 'parsing' | 'validating' | 'fixing' | 'reporting' | 'complete' | 'error';
  metadata: { type: string; degree: string; fileName: string };
  originalBuffer: Buffer;
  correctedBuffer?: Buffer;
  documentModel?: DocumentModel;
  results?: ValidationResults;
  changes?: ChangeRecord[];
  error?: string;
}

// TTL cleanup: sessions expire after 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id);
  }
}, 60000);
```

**Note on Vercel:** Serverless functions have a max execution time (default 10s, Pro plan 300s). For MVP, processing must complete within this window. If documents are complex, we may need:
- Vercel Pro plan for 300s timeout
- Or: chunked processing with client-side polling against a temporary storage (Phase 2)

---

## 6. Component Tree

```
app/
├── layout.tsx                     # Root layout with MUI ThemeProvider, UCSD branding
├── page.tsx                       # Upload Screen
├── processing/
│   └── page.tsx                   # Processing Screen
├── results/
│   └── page.tsx                   # Results Screen
│
components/
├── layout/
│   ├── AppHeader.tsx              # UCSD/GEPA branded header bar
│   ├── AppFooter.tsx              # Footer with links to GEPA resources
│   └── PageContainer.tsx          # Max-width centered container
│
├── upload/
│   ├── DropZone.tsx               # Drag-and-drop file upload area
│   ├── FileInfo.tsx               # Selected file name, size, type display
│   ├── DocumentTypeSelector.tsx   # Dissertation vs Thesis radio group
│   ├── DegreeTypeSelector.tsx     # Doctoral vs Master's radio group
│   ├── UploadForm.tsx             # Combines all upload controls
│   └── PreviousResultsBanner.tsx  # Shows if resubmitting
│
├── processing/
│   ├── ProgressBar.tsx            # Overall progress bar
│   ├── RuleCheckList.tsx          # Live updating checklist of rule categories
│   └── RuleCheckItem.tsx          # Individual rule category status line
│
├── results/
│   ├── SummaryCard.tsx            # Overall pass/fail/score summary
│   ├── ComplianceChecklist.tsx    # Accordion list of all rules by category
│   ├── RuleCategoryAccordion.tsx  # Expandable category with rule results
│   ├── RuleResultItem.tsx         # Single rule pass/fail/fix display
│   ├── ChangelogSection.tsx       # List of auto-applied changes
│   ├── ChangelogItem.tsx          # Individual change with before/after
│   ├── ManualFixesSection.tsx     # Numbered manual fix instructions
│   ├── ManualFixItem.tsx          # Single manual fix instruction
│   ├── DownloadButtons.tsx        # Download corrected doc + report
│   └── ResubmitComparison.tsx     # Side-by-side previous vs current results
│
└── common/
    ├── StatusChip.tsx             # Pass/Fail/Warning/Fixed chip
    ├── FileIcon.tsx               # .docx file icon
    └── LoadingSpinner.tsx         # General loading indicator
```

---

## 7. File Structure

```
dissertation-formatter/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Build + lint check on PR
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Upload screen (/)
│   ├── processing/
│   │   └── page.tsx               # Processing screen
│   ├── results/
│   │   └── page.tsx               # Results screen
│   └── api/
│       ├── upload/
│       │   └── route.ts           # POST /api/upload
│       ├── status/
│       │   └── [sessionId]/
│       │       └── route.ts       # GET /api/status/:sessionId
│       ├── results/
│       │   └── [sessionId]/
│       │       └── route.ts       # GET /api/results/:sessionId
│       └── download/
│           └── [sessionId]/
│               ├── document/
│               │   └── route.ts   # GET /api/download/:id/document
│               └── report/
│                   └── route.ts   # GET /api/download/:id/report
├── components/
│   ├── layout/
│   │   ├── AppHeader.tsx
│   │   ├── AppFooter.tsx
│   │   └── PageContainer.tsx
│   ├── upload/
│   │   ├── DropZone.tsx
│   │   ├── FileInfo.tsx
│   │   ├── DocumentTypeSelector.tsx
│   │   ├── DegreeTypeSelector.tsx
│   │   ├── UploadForm.tsx
│   │   └── PreviousResultsBanner.tsx
│   ├── processing/
│   │   ├── ProgressBar.tsx
│   │   ├── RuleCheckList.tsx
│   │   └── RuleCheckItem.tsx
│   ├── results/
│   │   ├── SummaryCard.tsx
│   │   ├── ComplianceChecklist.tsx
│   │   ├── RuleCategoryAccordion.tsx
│   │   ├── RuleResultItem.tsx
│   │   ├── ChangelogSection.tsx
│   │   ├── ChangelogItem.tsx
│   │   ├── ManualFixesSection.tsx
│   │   ├── ManualFixItem.tsx
│   │   ├── DownloadButtons.tsx
│   │   └── ResubmitComparison.tsx
│   └── common/
│       ├── StatusChip.tsx
│       ├── FileIcon.tsx
│       └── LoadingSpinner.tsx
├── lib/
│   ├── constants.ts               # UCSD colors, approved fonts, rule IDs
│   ├── types.ts                   # All TypeScript interfaces
│   ├── session-store.ts           # In-memory session Map + TTL cleanup
│   ├── pipeline/
│   │   ├── index.ts               # Pipeline orchestrator
│   │   ├── parser.ts              # mammoth.js + JSZip document parser
│   │   ├── validator.ts           # Rule engine runner
│   │   ├── formatter.ts           # Auto-fix applicator
│   │   └── reporter.ts            # PDF report generator (pdf-lib)
│   ├── rules/
│   │   ├── index.ts               # Rule registry (all rules exported)
│   │   ├── margins.ts             # MARGIN-001 through MARGIN-006
│   │   ├── fonts.ts               # FONT-001 through FONT-006
│   │   ├── pagination.ts          # PAGE-001 through PAGE-009
│   │   ├── page-order.ts          # ORDER-001 through ORDER-012
│   │   ├── title-page.ts          # TITLE-001 through TITLE-009
│   │   ├── approval-page.ts       # APPROVAL-001 through APPROVAL-004
│   │   ├── abstract.ts            # ABSTRACT-001 through ABSTRACT-004
│   │   ├── spacing.ts             # SPACE-001 through SPACE-005
│   │   ├── indentation.ts         # INDENT-001 through INDENT-002
│   │   ├── figures-tables.ts      # FIG-001 through FIG-008
│   │   ├── references.ts          # REF-001 through REF-006
│   │   ├── text-formatting.ts     # TEXT-001 through TEXT-003
│   │   └── accessibility.ts       # A11Y-001 through A11Y-006
│   └── docx/
│       ├── reader.ts              # Low-level .docx XML reading via JSZip
│       ├── writer.ts              # Low-level .docx XML modification via JSZip
│       └── utils.ts               # Twips conversion, XML helpers
├── theme/
│   ├── index.ts                   # MUI theme with UCSD brand colors
│   └── ucsd-colors.ts             # UCSD Navy (#182B49), Gold (#C69214), etc.
├── public/
│   ├── ucsd-logo.svg              # UCSD logo for header
│   └── gepa-logo.svg              # GEPA logo
├── BRIEF.md
├── SPEC.md                        # This file
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
└── eslint.config.mjs
```

---

## 8. MVP Scope

### MVP (Phase 1) — Target: 4-6 weeks

**In scope:**
- `.docx` file upload only (no PDF, no LaTeX)
- Full validation of all 48 active formatting rules (pass/fail/warning per rule)
- Auto-fixes for rules marked ✅ in §3 (~20 rules):
  - Margins (all sides, page number position, abstract top margin)
  - Fonts (family, size, consistency, color → black)
  - Spacing (double-space body, single-space block quotes, reference spacing)
  - Indentation (first-line indent, block quote indent)
  - Title page formatting (university name caps, committee indent/spacing)
  - Approval page formatting (alignment, header removal)
  - Caption style normalization
  - Heading italic removal
  - Hyperlink color override
- Compliance report (PDF) with checklist + changelog + manual fix guidance
- Corrected `.docx` download
- Resubmit flow with comparison
- UCSD-branded UI (MUI theme)
- Deploy to Vercel

**Not in MVP:**
- No user accounts, no authentication
- No file persistence (stateless — everything in memory)
- No PDF input support
- No LaTeX input support

### Phase 2

| Feature | Description |
|---------|-------------|
| **Full auto-pagination** | Automatically set Roman/Arabic page numbers, fix numbering gaps |
| **Page reordering** | Detect and auto-reorder sections to correct sequence |
| **Accessibility (WCAG 2.1 AA)** | Full tag injection, alt-text prompting, reading order, contrast checks |
| **PDF output** | Generate accessible tagged PDF from corrected .docx |
| **UCSD SSO** | Integrate with UC San Diego Single Sign-On for student authentication |
| **Kuali integration** | Connect to Kuali workflow — auto-submit compliant documents |
| **LaTeX support** | Accept .tex files, compile to .docx/.pdf, then validate |
| **Batch processing** | GEPA advisors can upload multiple documents |
| **Analytics dashboard** | Track common errors, submission volumes, compliance rates |
| **Email notifications** | Notify students when review is complete |
| **UC-wide deployment** | White-label for other UC campuses (BearGPT pattern) |

---

## 9. UI/Brand Guidelines

**All UI must follow the official UC San Diego CMS V5 department template: https://department.ucsd.edu/**

### Header (3-part structure)
1. **Teal stripe**: Thin decorative bar at top, background `#2b92b9`
2. **Title bar**: White background, site name in BLACK uppercase Teko SemiBold (1.75rem) on left, UC San Diego logo on right. Height ~92px, padding 1.5em 0
3. **Nav bar**: Background `#00629b` (UCSD blue, NOT navy), white text links, hover `#004268`, font-size 16px

### Footer
- Background: `#182B49` (navy)
- Left column: Address "UC San Diego 9500 Gilman Dr. La Jolla, CA 92093 (858) 534-2230", then copyright, then links
- Links: Accessibility | Privacy | Terms of Use — white, underlined, separated by pipe borders
- Right column: White UCSD logo from `cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png`

### Typography
### Typography (UCSD Campus Standard from brand.ucsd.edu)
- **Headings (H1-H5):** Teko SemiBold — condensed geometric sans-serif, ALL CAPS, loaded from `cdn.ucsd.edu/cms/decorator-5/styles/teko.css`. Substitute for Refrigerator Deluxe (brand headline font).
- **Body text:** Roboto — regular + bold, loaded from Google Fonts. Substitute for Brix Sans (brand body font).
- Font imports via CSS `@import` in globals.css (not `<link>` tags)
- Teko is ONLY for headings. Nav links, buttons, labels, body text all use Roboto.
- H1-H3: Teko SemiBold, uppercase, fontWeight 600
- H4-H5: Teko SemiBold, uppercase
- H6: Teko SemiBold (mixed case OK)
- Body: Roboto, 12-16px for digital
- Site title in header: Teko SemiBold
- Fallbacks: "Helvetica Neue", Arial, sans-serif
- Site title: uppercase, letter-spacing 1px

### Colors

- Nav blue: `#00629b`
- Nav hover: `#004268`
- Footer background: `#00629b` (same as nav blue)
- Gold accent: `#C69214`
- Body background: `#ffffff`
- Text: standard dark (`rgba(0,0,0,0.87)`)

### Mobile Responsive Behavior (< 768px / `md` breakpoint)

**Header — mobile:**
- Teal stripe still appears at top
- White title bar is **hidden** on mobile
- Nav bar collapses horizontal links; instead shows:
  - Left: hamburger `IconButton` with `MenuIcon` + "MENU" text (white, uppercase)
  - Right: UC San Diego logo (36px tall)
- Tapping hamburger opens an MUI `Drawer` sliding in from the left:
  - Drawer background: `#00629b` (nav blue)
  - Top bar background: `#004268` (darker blue) with "✕ Close Nav" button
  - Nav links rendered as `List` / `ListItemButton` with dividers
  - Tapping any link or clicking outside closes the drawer

**Footer — mobile:**
- Stacks vertically (column): address → copyright → links → UC San Diego logo at bottom
- Achieved via `flexDirection: { xs: 'column', md: 'row' }`

**Implementation notes:**
- Uses MUI `useMediaQuery(theme.breakpoints.up('md'))` to detect desktop vs mobile
- `@mui/icons-material` required for `MenuIcon`
- Do NOT use MUI AppBar — use Box/styled components to match CMS V5 layout

### Key Rules
- Do NOT use MUI AppBar for the header — use Box/styled components matching CMS V5 layout
- Do NOT say "Powered by TritonAI" anywhere
- Header is WHITE with a teal stripe — not navy
- The app should look like an official UCSD department tool, not a startup product

### Reference
- CSS source: `cdn.ucsd.edu/cms/decorator-5/styles/base.min.css`
- Template source: `department.ucsd.edu`

## 10. Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | Next.js 15 (App Router) | Already scaffolded. SSR for processing, API routes built in. Vercel-native. |
| **Language** | TypeScript | Type safety for complex document model and rule engine. |
| **UI Library** | MUI (Material UI) | Consistent, accessible components. Easy to theme with UCSD brand. |
| **Document parsing** | mammoth.js | Proven .docx → HTML/text extraction. MIT licensed. |
| **Low-level .docx access** | JSZip | mammoth.js doesn't expose margins/styles/pagination. JSZip reads raw XML inside .docx. |
| **Document modification** | JSZip (XML manipulation) | Direct XML edits for formatting fixes (margins, spacing, fonts). More precise than rebuilding via `docx` package. |
| **Document generation** | docx (npm) | If sections need to be rebuilt from scratch (Phase 2 page reordering). |
| **PDF report** | pdf-lib | Client-side PDF generation, no external service needed. UCSD-branded compliance report. |
| **State management** | In-memory Map | Stateless MVP — no database. Sessions expire after 1 hour. |
| **Deployment** | Vercel | GitHub push → auto-deploy. Need Pro plan for 300s API timeout on complex documents. |
| **Styling** | MUI `sx` prop + theme | No additional CSS framework. Theme defines UCSD colors, typography. |

### UCSD Brand Theme

```typescript
// theme/ucsd-colors.ts
export const ucsdColors = {
  navy: '#182B49',        // Primary
  gold: '#C69214',        // Accent
  blue: '#006A96',        // Links
  cyan: '#00629B',        // Secondary
  white: '#FFFFFF',
  lightGray: '#E5E5E5',
  darkGray: '#747678',
  success: '#2E7D32',     // Rule passed
  error: '#D32F2F',       // Rule failed
  warning: '#ED6C02',     // Warning
  info: '#0288D1',        // Auto-fixed
};
```

### Risk Considerations

| Risk | Mitigation |
|------|-----------|
| **Vercel timeout** (10s free, 300s Pro) | Keep processing lean. Consider Pro plan. Could split into chunked processing in Phase 2. |
| **mammoth.js limitations** | Supplement with direct JSZip XML parsing for properties mammoth doesn't expose. |
| **Complex pagination detection** | MVP flags pagination issues but doesn't auto-fix numbering. Phase 2 tackles this. |
| **Large documents (50MB)** | Stream processing where possible. Memory limits on Vercel serverless (~1GB). |
| **Section detection accuracy** | Use heuristics (heading text matching, position, style names) + warn on low confidence. |
| **Rule false positives** | Every flagged issue includes severity + confidence. Students can override warnings on resubmit. |

---

*End of SPEC.md — Ready for Builder phase upon approval.*
