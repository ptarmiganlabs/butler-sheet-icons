---
name: qseow
description: "Skill for the Qseow area of butler-sheet-icons. 8 symbols across 6 files."
---

# Qseow

8 symbols | 6 files | Cohesion: 80%

## When to Use

- Working with code in `src/`
- Understanding how qseowProcessApp, qseowUpdateSheetThumbnails, qseowUploadToContentLibrary work
- Modifying qseow-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/qseow/qseow-certificates.js` | exists, qseowVerifyCertificatesExist |
| `src/lib/qseow/qseow-enigma.js` | readCert, createSocket |
| `src/lib/qseow/qseow-process-app.js` | qseowProcessApp |
| `src/lib/qseow/qseow-updatesheets.js` | qseowUpdateSheetThumbnails |
| `src/lib/qseow/qseow-upload.js` | qseowUploadToContentLibrary |
| `src/lib/util/errors.js` | QseowError |

## Entry Points

Start here when exploring this area:

- **`qseowProcessApp`** (Function) — `src/lib/qseow/qseow-process-app.js:100`
- **`qseowUpdateSheetThumbnails`** (Function) — `src/lib/qseow/qseow-updatesheets.js:32`
- **`qseowUploadToContentLibrary`** (Function) — `src/lib/qseow/qseow-upload.js:32`
- **`qseowVerifyCertificatesExist`** (Function) — `src/lib/qseow/qseow-certificates.js:30`
- **`createSocket`** (Function) — `src/lib/qseow/qseow-enigma.js:71`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `QseowError` | Class | `src/lib/util/errors.js` | 91 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 100 |
| `qseowUpdateSheetThumbnails` | Function | `src/lib/qseow/qseow-updatesheets.js` | 32 |
| `qseowUploadToContentLibrary` | Function | `src/lib/qseow/qseow-upload.js` | 32 |
| `qseowVerifyCertificatesExist` | Function | `src/lib/qseow/qseow-certificates.js` | 30 |
| `createSocket` | Function | `src/lib/qseow/qseow-enigma.js` | 71 |
| `exists` | Function | `src/lib/qseow/qseow-certificates.js` | 12 |
| `readCert` | Function | `src/lib/qseow/qseow-enigma.js` | 15 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 2 calls |
| Browser | 1 calls |

## How to Explore

1. `gitnexus_context({name: "qseowProcessApp"})` — see callers and callees
2. `gitnexus_query({query: "qseow"})` — find related execution flows
3. Read key files listed above for implementation details
