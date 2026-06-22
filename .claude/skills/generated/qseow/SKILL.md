---
name: qseow
description: "Skill for the Qseow area of butler-sheet-icons. 4 symbols across 2 files."
---

# Qseow

4 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how qseowVerifyCertificatesExist, createSocket work
- Modifying qseow-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/qseow/qseow-certificates.js` | exists, qseowVerifyCertificatesExist |
| `src/lib/qseow/qseow-enigma.js` | readCert, createSocket |

## Entry Points

Start here when exploring this area:

- **`qseowVerifyCertificatesExist`** (Function) — `src/lib/qseow/qseow-certificates.js:31`
- **`createSocket`** (Function) — `src/lib/qseow/qseow-enigma.js:69`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `qseowVerifyCertificatesExist` | Function | `src/lib/qseow/qseow-certificates.js` | 31 |
| `createSocket` | Function | `src/lib/qseow/qseow-enigma.js` | 69 |
| `exists` | Function | `src/lib/qseow/qseow-certificates.js` | 13 |
| `readCert` | Function | `src/lib/qseow/qseow-enigma.js` | 13 |

## How to Explore

1. `gitnexus_context({name: "qseowVerifyCertificatesExist"})` — see callers and callees
2. `gitnexus_query({query: "qseow"})` — find related execution flows
3. Read key files listed above for implementation details
