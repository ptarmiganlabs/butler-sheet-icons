---
name: cloud
description: "Skill for the Cloud area of butler-sheet-icons. 13 symbols across 7 files."
---

# Cloud

13 symbols | 7 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how listCollections, listApps, listAppsByCollection work
- Modifying cloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cloud/cloud-apps.js` | appsFromItems, listCollections, listApps, listAppsByCollection |
| `src/lib/cloud/cloud-repo-request.js` | bufferToStream, makeRequest, request |
| `src/lib/commands/qscloud/create-sheet-thumbnails.interactive.js` | choices, resolve |
| `src/lib/cloud/cloud-collections.js` | qscloudVerifyCollectionExists |
| `src/lib/cloud/saas-response.js` | saasGetList |
| `src/lib/interactive/labels.js` | labelForCollection |
| `src/lib/cloud/cloud-repo.js` | qlikSaas |

## Entry Points

Start here when exploring this area:

- **`listCollections`** (Function) — `src/lib/cloud/cloud-apps.js:85`
- **`listApps`** (Function) — `src/lib/cloud/cloud-apps.js:112`
- **`listAppsByCollection`** (Function) — `src/lib/cloud/cloud-apps.js:139`
- **`qscloudVerifyCollectionExists`** (Function) — `src/lib/cloud/cloud-collections.js:133`
- **`saasGetList`** (Function) — `src/lib/cloud/saas-response.js:39`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `listCollections` | Function | `src/lib/cloud/cloud-apps.js` | 85 |
| `listApps` | Function | `src/lib/cloud/cloud-apps.js` | 112 |
| `listAppsByCollection` | Function | `src/lib/cloud/cloud-apps.js` | 139 |
| `qscloudVerifyCollectionExists` | Function | `src/lib/cloud/cloud-collections.js` | 133 |
| `saasGetList` | Function | `src/lib/cloud/saas-response.js` | 39 |
| `choices` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.interactive.js` | 152 |
| `resolve` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.interactive.js` | 171 |
| `labelForCollection` | Function | `src/lib/interactive/labels.js` | 43 |
| `appsFromItems` | Function | `src/lib/cloud/cloud-apps.js` | 22 |
| `bufferToStream` | Function | `src/lib/cloud/cloud-repo-request.js` | 59 |
| `makeRequest` | Function | `src/lib/cloud/cloud-repo-request.js` | 75 |
| `request` | Function | `src/lib/cloud/cloud-repo-request.js` | 149 |
| `qlikSaas` | Function | `src/lib/cloud/cloud-repo.js` | 19 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `QscloudVerifyCollectionExists → SafeString` | cross_community | 6 |
| `QscloudVerifyCollectionExists → SafeRead` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Util | 2 calls |

## How to Explore

1. `context({name: "listCollections"})` — see callers and callees
2. `query({search_query: "cloud"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
