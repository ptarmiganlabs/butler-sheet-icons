<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#88,
into guide/troubleshooting.md.

PLACEMENT DIFFERS FROM THE DRAFT. The draft proposes the QS Cloud Authentication Problems section.
Published under Run Failures and Exit Codes instead, with the other message-keyed entries: the
distinguishing fact is that the request SUCCEEDED. Axios rejects on 4xx/5xx with no validateStatus
override, so a rejected API key never reaches this check at all. The authentication section links
across rather than hosting it.

Added beyond the draft: the QSEoW counterpart, `QRS returned an unusable response for "<path>"`.
The same guard exists over QRS responses and its message was nowhere on the site, although the fix
it came from is described in the "Fixed in 4.1.0" section without quoting anything searchable.

Note for anyone quoting that QRS message: `apiUrl` is a QRS PATH (`app/full`,
`app/full?filter=...`), not a full URL. First draft of the published example used a full URL and
was corrected against the call sites.

Everything else -- both Cloud messages, the three API paths, the skip warning and its two `source`
wordings, and that an empty list returns [] rather than throwing -- verified verbatim.
-->

# An unreadable reply from Qlik Sense Cloud now says so

When Butler Sheet Icons asked your tenant for a list — your collections, the apps in a
collection, or the apps on the tenant — it assumed the answer would be a list. If it was
anything else, the run stopped with a message like this:

```
TypeError: allCollections.map is not a function
```

That names a variable inside Butler Sheet Icons. It does not tell you which request failed,
which tenant answered, or what the tenant actually sent — and nothing in it suggests what to
check. This is the Qlik Sense Cloud counterpart to the QRS fix described in _Options and error
messages that told you the wrong thing_; the two platforms now behave the same way.

Nothing changes for a run that already works.

## What you will see instead

```
Qlik Sense Cloud returned an unusable response for "collections": expected a list, got string
```

The last word is what arrived instead of a list — `string` for an HTML page, `object` for an
error document. If the tenant answered successfully but sent nothing at all, you get this
instead:

```
Qlik Sense Cloud returned status 200 and an empty body for "collections", expected a list
```

The quoted part is the request that failed, which tells you what to look at:

| Request                  | What Butler Sheet Icons was asking for |
| ------------------------ | -------------------------------------- |
| `collections`            | The collections on your tenant         |
| `collections/<id>/items` | The contents of one collection         |
| `items?resourceType=app` | Every app on the tenant                |

## What to check

This message means the request **succeeded** — Qlik Cloud, or something standing in for it,
answered with a normal success code — but what came back was not a list of anything. That
narrows the cause considerably:

- **Something is answering instead of your tenant.** A proxy, gateway, or corporate network
  that intercepts outbound traffic will happily return its own page with a 200. `got string`
  almost always means HTML arrived where JSON was expected. Try the same URL from the machine
  running Butler Sheet Icons and look at what comes back.
- **The tenant URL points somewhere that is not a Qlik Cloud tenant.** A typo in
  `--tenanturl` that still resolves to a real web server produces exactly this.
- **An empty body** usually means a gateway timed out and closed the response without content.

**A rejected API key does not produce this message.** Expired keys, missing scopes and wrong
tenant names return proper HTTP error codes, and those are reported separately, as a failed
request naming the status. If you are chasing a permissions problem, that is the message to
look for — not this one.

## An empty result is still an empty result

A tenant with no collections, or a collection with no apps, is a normal answer and is treated
as one. Only a reply Butler Sheet Icons cannot read is reported as a failure. This matters for
scheduled jobs: a broken tenant can no longer look like a successful run that happened to have
nothing to do.

## One more case

An entry in an otherwise valid list that claims to be an app but carries no app id is now
skipped with a warning, instead of stopping the run:

```
Skipping collection item <item id> as it claims to be an app but carries no app id
```

The other apps in the list are processed as normal. If you see this, that one app is missing
from the run — the warning names the item so you can find it in the tenant. Previously such an
entry either stopped the run outright or, worse, was carried forward as an app with no id and
reported later as a failure that named nothing.

## Commands affected

Any command that resolves apps through a collection, or lists collections:

- `butler-sheet-icons qscloud create-sheet-thumbnails --collectionid ...`
- `butler-sheet-icons qscloud remove-sheet-icons --collectionid ...`
- `butler-sheet-icons qscloud list-collections`

Runs that name apps directly with `--appid` do not query collections and are unaffected.
