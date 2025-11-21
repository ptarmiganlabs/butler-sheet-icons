# Add API-based verification via Enigma.js for QS Cloud E2E tests

Status: Draft (Issues are disabled on this repo; enable Issues to create this formally)

Assignee: TBD

Labels: enhancement, testing, qscloud

## Summary

Add a second layer of verification to the QS Cloud E2E workflow using Enigma.js to inspect app sheet metadata and confirm that thumbnail assignments are correct after Butler Sheet Icons (BSI) runs.

## Background

- Current E2E validation (bsi-qscloud-scheduled.yml) confirms success via UI:
  - Baseline cleanup with `qscloud remove-sheet-icons`
  - Overview screenshot BEFORE using Puppeteer (login + app overview)
  - Run `qscloud create-sheet-thumbnails` (release binary)
  - Overview screenshot AFTER (login + app overview)
  - Verifier ensures required screenshots exist and at least one `thumbnail-*.png` was generated
- Strengthening this with an API check makes failures more actionable and reduces false positives.

## Proposal (QS Cloud + Enigma.js)

- Use Enigma.js to open the app and inspect each sheet’s thumbnail assignment.
- Check `qStaticContentUrlDef.qUrl` on each sheet object:
  - BEFORE (after remove-sheet-icons): should be empty (undefined/null/"") for all sheets
  - AFTER (post thumbnail creation): should point to media path, typically `/media/files/thumbnails/<file>.png`
- Optionally make a HEAD request for each media URL to assert it resolves (non-404) and `Content-Length > 0`.

## Where to hook in the workflow

- BEFORE check: after the “Baseline cleanup - remove all sheet icons” step
- AFTER check: after the “Create sheet thumbnails” step
- Output JSON summaries (`api-verify-before.json`, `api-verify-after.json`) and fail the job if checks don’t pass.

## Implementation notes

- Reuse patterns in the repo:
  - Engine session and sheet enumeration exist in QS Cloud code paths
  - Reference points:
    - `src/lib/cloud/process-cloud-app.js` (engine session, sheet enumeration)
    - `src/lib/cloud/cloud-updatesheets.js` (sets `qStaticContentUrlDef.qUrl`)
    - `src/lib/cloud/cloud-utils.js` (sheet filtering logic)
- Keep the API verifier as a small Node script under `script/`.
- Inputs via env/args: tenant URL, API key, app ID.
- Either mimic BSI’s inclusion logic or check all sheets (document choice in the script).

## Acceptance criteria

- Workflow fails if:
  - BEFORE: any sheet has `qStaticContentUrlDef.qUrl` set
  - AFTER: any sheet does not have `qStaticContentUrlDef.qUrl` set to a `/media/files/thumbnails/...` path
- JSON summaries uploaded as artifacts.
- Logs clearly indicate which sheet(s) failed and why.

## Edge cases & constraints

- Published vs unpublished apps: test apps are unpublished, so all sheets are eligible.
- If exclude/blur rules are introduced in E2E, verifier should align with inclusion rules or explicitly ignore excluded sheets.
- Add small retries/backoff for transient API failures.

## Definition of Done

- API verifier script implemented under `script/`, using Enigma.js.
- Workflow updated to run it before and after the BSI run.
- Artifacts include the API verification JSONs and logs.
- Short README/CONTRIBUTING note on how to run the verifier locally.
