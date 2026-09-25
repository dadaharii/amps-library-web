# स्वभावगत-अपराध — Phase 1–5 report (STOP before apply)

**Status:** `EDITORIAL_CANDIDATE / HUMAN_APPROVAL_REQUIRED`  
**PUBLICATION_PASS=NO**  
**Canonical / live Reader:** not changed

Repaired candidate (post decision): same folder. Preview: `isolated-preview.html` (file:// only; not live Reader).

## Project and book paths

| Role | Path |
|---|---|
| Workspace / publisher repo | `/Users/hariishananda/Amps-Library-PMD-v37-Test` |
| Canonical Hindi book | `amps-reader/data/books/prout-in-a-nutshell-02-hi.json` |
| English companion | `amps-reader/data/books/prout-in-a-nutshell-02.json` |
| Live served copy | `/Users/hariishananda/Amps-Library/www/amps-reader/data/books/prout-in-a-nutshell-02-hi.json` |
| Live source copy | `/Users/hariishananda/Amps-Library/amps-reader/data/books/prout-in-a-nutshell-02-hi.json` |
| Hindi PDF (scan) | `/Users/hariishananda/Azure-ocr/Hindi-amps-books-pdf/कणिका में प्राउट द्वितीय खण्ड.pdf` (pp. 28–40) |
| OCR package | `/Users/hariishananda/Azure-ocr/output/कणिका में प्राउट द्वितीय खण्ड/package/book.json` |
| Editorial package | `/Users/hariishananda/Downloads/AMPS_Swabhavgat_Aparadh_Editorial_Package_20260922/` |
| Isolated candidate | `amps-reader/data/candidates/prout-02-hi-swabhavgat-20260922/` |

**IDs:** `prout-in-a-nutshell-02-hi` · family `prout-in-a-nutshell-02` · section id `ch-02`

## Structure note (do not collapse)

The brief calls this a *section of* विचार (न्याय). In the AMPS reader it is already a **sibling body chapter** (`ch-02`), not a subsection of `ch-01`. `ch-01` विचार (न्याय) already has 34 human-corrected paragraphs and must not be overwritten.

Canonical title still has a space: `स्वभावगत- अपराध`. Package house style: `स्वभावगत-अपराध`.

## Phase 1 — audit

- Book found; `paragraphLock: false`; book-level EN pair only (`englishTitle: Justice`).
- Canonical `ch-02`: **5** stitched OCR paragraphs, **0** `humanCorrected`.
- `ch-01` विचार (न्याय): **34** `humanCorrected` — preserve.
- Live PMD / Amps-Library / www copies of `ch-02` match (same 5 OCR paras).
- Package files: README, MD, TXT, DOCX, editorial review, SHA256SUMS.
- Checksums: MD / TXT / DOCX / README **OK**.  
  `सम्पादकीय-मिलान_प्रकाशन-पूर्व-समीक्षा.md` **FAIL** (on-disk SHA-256 `8dacfab1…`; listed `c3075ea5…`). File starts with a leading space before `#`. Treat review as readable but **integrity-unverified**.
- Completeness: supplied text runs जन्मगत कारणों… through जेलखाने के परिवेश… (PDF 28–40). Next heading अभ्यासगत अपराधी is outside, correctly.

## Phase 2 — editorial verification

Supplied body: **15** paragraphs (plus heading). Canonical: **5** blobs. Same discourse, better breaks; not paragraph-ID compatible.

### Six meaning-sensitive edits (still unresolved — human must accept)

| # | Canonical OCR | Supplied | Verdict |
|---|---|---|---|
| 1 | चीजों को समझ ही नहीं सकते | इन चीजों का महत्त्व ही नहीं समझ सकते | English-aided sense gloss. **Do not auto-accept.** |
| 2 | इन इनकी बुद्धि… भोथो… बुद्ध नहीं | इनकी बुद्धि… भोथी… बुद्धू नहीं | Fixes garbled OCR; “बुद्धू” is interpretive. **Human.** |
| 3 | अस्थि-संस्थान की विद्या कुछ-कुछ मनोविज्ञान एवं पुलिस… | …ज्ञान रखने तथा पुलिस और जनसाधारण के सामने… | Sentence rebuilt from English. **Human.** |
| 4 | जीवन-अणाली … बुणाक्षर न्याय | जीवन-प्रणाली … बेतरतीब ढंग से नहीं होती | English-based reconstruction. **Human.** |
| 5 | मनोवैज्ञानिक… नहीं तो समझते हैं | न केवल समझते हैं | Possible print error vs reconstruction. **Human.** |
| 6 | सबका चौकठ | सबकी चौखट | Grammar/spelling. Low meaning risk; still listed as sensitive. **Human.** |

### Hindi kept against English (package already flagged)

- चोरों के दल की **दलाली** kept (EN: prey on helpless victims).
- सबसे बड़े **ऋण** kept (EN: greatest responsibility).
- **अकुलीन** in supplied (canonical OCR **अकुलोन**). Package says scan supports अकुलीन.

### Other issues

- Conjunctions/punctuation in the candidate are cleaned; not a silent rewrite of later chapters.
- Uncertain OCR is documented; not silently replaced from English except the six rows.
- No existing human-approved text inside `ch-02` to preserve. Do not touch `ch-01`.

## Phase 3 — isolated candidate (not applied)

Created only:

- `proposed-chapter.json` — 15 paras, `editorialCandidate: true`, new `ch-02-p1`…`ch-02-p15`
- this report
- `ROLLBACK.md`

**Not done:** no write to `prout-in-a-nutshell-02-hi.json`, www, catalog, or search. No OCR rerun.

ID note: 5 → 15 paras. Old `ch-02-p1`…`p5` cannot be reused 1:1. On apply, remap IDs and rebuild `sections` / `points` / `search/prout-in-a-nutshell-02-hi.json`.

## Phase 4 — QA

| Check | Result |
|---|---|
| Coverage pp. 28–40 | Candidate complete vs package; not applied |
| Missing/duplicate paras | Candidate 15 unique blocks |
| Unicode | Devanagari + ASCII glosses OK in JSON |
| Heading | Package `स्वभावगत-अपराध` vs canon `स्वभावगत- अपराध` |
| Reader layout | Not published; no live preview of candidate |
| Unrelated content | Unchanged |
| Restoration test | Not rerun (no code/catalog change) |

Reader preview of **current canonical** (old OCR):  
http://localhost:8765/amps-reader/#book/prout-in-a-nutshell-02-hi/ch-02

## Phase 5 — readiness

**Not publication-ready.** Six meaning-sensitive items + three HI/EN sense splits + checksum fail on the review file remain.

### Rollback (if someone applies later)

1. Restore `prout-in-a-nutshell-02-hi.json` from git (`amps-reader/data/books/prout-in-a-nutshell-02-hi.json`).
2. Copy the same file to Amps-Library source + `www`.
3. Restore matching `search/prout-in-a-nutshell-02-hi.json`.
4. Confirm `ch-01` still 34 human-corrected paras; `ch-02` back to 5 OCR paras.

Until then, rollback is unused: canonical was not replaced.

## Approval needed before any apply

Please confirm explicitly:

1. Accept or reject each of the six meaning-sensitive rows.  
2. Keep दलाली / ऋण / अकुलीन as in the package.  
3. Title form: `स्वभावगत-अपराध` vs `स्वभावगत- अपराध`.  
4. Keep `ch-02` as its own TOC chapter (recommended) vs nest under विचार (न्याय).  
5. Recalculate SHA for the review file, or replace with the hashed original.

After written approval: apply candidate only to `ch-02`, rebuild search/points, then Reader QA on localhost.
