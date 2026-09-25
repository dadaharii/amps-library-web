# SHA-256 verification

**Do not treat a newly calculated hash of the dirty extract as authenticity.**

## Finding

| Copy | First bytes | SHA-256 |
|---|---|---|
| Listed in `SHA256SUMS.txt` | — | `c3075ea5cd7a34a4f17a17298eca20786b9e00c36ccf86c5c28139bb994ceaa7` |
| ZIP member `सम्पादकीय-मिलान_प्रकाशन-पूर्व-समीक्षा.md` | `# सम्` | **same as listed** |
| Extracted Downloads folder file | ` # सम्` (one ASCII space, then `#`) | `8dacfab127f29e0b30c13271b82a835a681ad799295f59b19104ff1abaf26edf` |

Exact difference: **one leading `0x20` before `#`**. Not a filename issue. Not CRLF. Not BOM.

`extracted[1:]` equals the ZIP member byte-for-byte and then matches the listed hash. That only proves the extract is the ZIP file plus one space, not that a new hash of the spaced file is authentic.

## Other package files

ZIP members for DOCX, MD, TXT, README match `SHA256SUMS.txt`. Those extracted copies also matched earlier.

## Repair record

- Original ZIP left in place: `/Users/hariishananda/Downloads/AMPS_Swabhavgat_Aparadh_Editorial_Package_20260922.zip`
- Verified ZIP members copied to `evidence/zip-*` (untouched bytes).
- Dirty extract preserved as `evidence/extracted-सम्पादकीय-मिलान_प्रकाशन-पूर्व-समीक्षा.md`.
- `CANDIDATE_MANIFEST.sha256` lists listed hashes + ZIP status + hashes of repaired candidate artifacts.
- The Downloads extracted review file was **not** silently overwritten; the listed checksum was **not** rewritten to the dirty hash.

Integrity of the **original package** for the review file: **PASS via ZIP member**.  
Integrity of the **extracted review file as found**: **FAIL** (leading space).
