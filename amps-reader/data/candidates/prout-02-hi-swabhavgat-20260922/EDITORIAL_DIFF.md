# Complete editorial diff (isolated candidate vs canonical OCR)

Canonical `ch-02`: 5 blobs, title `स्वभावगत- अपराध`.  
Repaired candidate: 15 paras, title `स्वभावगत-अपराध`.

This is a **reflow + selective spelling** diff, not a 1:1 paragraph replace.

## Structural

- Split (क)/(ख) out of blob 1.
- Split blob 2 across candidate p3–p8 (osteology through फाँसी start).
- Join blob 3 onto p8 (page-break stitch).
- Blob 4 → p9.
- Blob 5 → p10–p15.

## Approved spelling / light cleanup (in candidate)

- Title space removed.
- भोथो → भोथी; बुद्ध नहीं → बुद्धू नहीं; duplicate इन dropped.
- जीवन-अणाली → जीवन-प्रणाली (rest of that sentence stays source-like).
- Ordinary punctuation/orthography from the package (ग्रन्थि, क्षति, वञ्चित, etc.) retained where not in HOLD rows.

## Reverted vs first package draft

- महत्त्व ही नहीं समझ सकते → चीजों को समझ ही नहीं सकते।
- Osteology English rebuild → Hindi `…के पास मनस्तात्त्विक अभिनय…`
- बेतरतीब ढंग से नहीं होती → बुणाक्षर न्याय से नहीं होता
- न केवल समझते → नहीं तो समझते
- सबकी चौखट → सबका चौकठ

## Not changed vs source meaning

दलाली, ऋण, अकुलीन; HOLD sentences as above.

See `source-to-candidate-mapping.json` for ID coverage.
