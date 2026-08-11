---
name: qseow
description: "Skill for the Qseow area of butler-sheet-icons. 12 symbols across 8 files."
---

# Qseow

12 symbols | 8 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how qrsGetList, qseowProcessApp, qseowUpdateSheetThumbnails work
- Modifying qseow-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/qseow/qseow-process-app.js` | getSheetsTaggedWith, qseowProcessApp |
| `src/lib/util/errors.js` | QseowError, CertError |
| `src/lib/qseow/qseow-certificates.js` | exists, qseowVerifyCertificatesExist |
| `src/lib/qseow/qseow-enigma.js` | readCert, createSocket |
| `src/lib/qseow/qrs-response.js` | qrsGetList |
| `src/lib/qseow/qseow-updatesheets.js` | qseowUpdateSheetThumbnails |
| `src/lib/qseow/qseow-upload.js` | qseowUploadToContentLibrary |
| `src/lib/util/cert.js` | getCertFilePaths |

## Entry Points

Start here when exploring this area:

- **`qrsGetList`** (Function) — `src/lib/qseow/qrs-response.js:28`
- **`qseowProcessApp`** (Function) — `src/lib/qseow/qseow-process-app.js:162`
- **`qseowUpdateSheetThumbnails`** (Function) — `src/lib/qseow/qseow-updatesheets.js:33`
- **`qseowUploadToContentLibrary`** (Function) — `src/lib/qseow/qseow-upload.js:32`
- **`qseowVerifyCertificatesExist`** (Function) — `src/lib/qseow/qseow-certificates.js:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `QseowError` | Class | `src/lib/util/errors.js` | 91 |
| `CertError` | Class | `src/lib/util/errors.js` | 43 |
| `qrsGetList` | Function | `src/lib/qseow/qrs-response.js` | 28 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 162 |
| `qseowUpdateSheetThumbnails` | Function | `src/lib/qseow/qseow-updatesheets.js` | 33 |
| `qseowUploadToContentLibrary` | Function | `src/lib/qseow/qseow-upload.js` | 32 |
| `qseowVerifyCertificatesExist` | Function | `src/lib/qseow/qseow-certificates.js` | 49 |
| `getCertFilePaths` | Function | `src/lib/util/cert.js` | 18 |
| `createSocket` | Function | `src/lib/qseow/qseow-enigma.js` | 76 |
| `getSheetsTaggedWith` | Function | `src/lib/qseow/qseow-process-app.js` | 44 |
| `exists` | Function | `src/lib/qseow/qseow-certificates.js` | 21 |
| `readCert` | Function | `src/lib/qseow/qseow-enigma.js` | 16 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 2 calls |
| Browser | 1 calls |

## How to Explore

1. `gitnexus_context({name: "qrsGetList"})` — see callers and callees
2. `gitnexus_query({query: "qseow"})` — find related execution flows
3. Read key files listed above for implementation details
