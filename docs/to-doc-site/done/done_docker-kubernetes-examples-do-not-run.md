# The Kubernetes examples in the Docker examples page do not run

<!--
PUBLISHED 2026-08-09.

Doc site PR ptarmiganlabs/butler-sheet-icons-docs#59 (into next), published to production by #60.
Landed on /examples/docker, replacing the Job and CronJob manifests.

Added at publication, beyond what this draft proposed:
  * A note that Docker Compose's command:, used correctly further up the same page, means what
    Kubernetes calls args:. Without it the new "use args:, never command:" callout reads as
    contradicting the Compose examples above it.
-->


Target page: `docs/examples/docker.md` — **fix the "Kubernetes Deployment" section** (the `Job` and
`CronJob` manifests, currently lines 403–492). The rest of the page is fine.

Both manifests fail immediately if anyone copies them. This is a correction, not new material.

::: tip No version gate needed
The manifests have never worked. This is not a change in behaviour.
:::

::: warning One link depends on another draft
"Other changes to make in the same edit" links to
`/guide/advanced/docker#decide-which-version-you-are-approving`, an anchor created by the
`docker-air-gapped-environments.md` draft in this folder. The site build does not check `#anchor`
fragments, so publish that draft first or drop the fragment. The other link on this page,
`#writing-thumbnails-to-a-mounted-folder-on-linux`, already exists on the site.
:::

---

## The problem

Both manifests start the container like this:

```yaml
command:
  - "node"
  - "butler-sheet-icons.js"
  - "qscloud"
  - "create-sheet-icons"
```

There are two independent faults, either of which is enough to break the job.

**The path is wrong.** Inside the image the application lives at `/nodeapp/src/butler-sheet-icons.js`,
and the working directory is `/nodeapp`. The container exits at once:

```
Error: Cannot find module '/nodeapp/butler-sheet-icons.js'
```

**`command:` replaces the image's entrypoint.** In Kubernetes, `command:` overrides the image's
`ENTRYPOINT` and `args:` overrides its `CMD`. The Butler Sheet Icons image does real work in its
entrypoint: it decides which user the application should run as, based on who owns the directory the
thumbnails are written to, and it makes sure that user has a usable home directory. Replacing
`command:` skips all of it. Even with the path corrected, the pod would run as whatever user
Kubernetes picked, without the adjustment the image makes for you — the same class of problem
described under
[Writing thumbnails to a mounted folder on Linux](/guide/advanced/docker#writing-thumbnails-to-a-mounted-folder-on-linux).

**The fix for both is the same: use `args:`, and pass exactly what you would pass to
`docker run`.**

## Proposed replacement

> ### Job Example
>
> Pass the Butler Sheet Icons command in `args:`, never in `command:`. `args:` supplies the
> arguments and leaves the image's own entrypoint in place; `command:` replaces the entrypoint and
> stops the container from setting itself up correctly.
>
> ```yaml
> apiVersion: batch/v1
> kind: Job
> metadata:
>   name: butler-sheet-icons-job
> spec:
>   template:
>     spec:
>       containers:
>         - name: butler-sheet-icons
>           image: ptarmiganlabs/butler-sheet-icons:4.0.0
>           args:
>             - "qscloud"
>             - "create-sheet-thumbnails"
>             - "--imagedir"
>             - "./img"
>           env:
>             - name: BSI_QSCLOUD_CST_TENANTURL
>               valueFrom:
>                 secretKeyRef:
>                   name: qlik-credentials
>                   key: tenant-url
>             - name: BSI_QSCLOUD_CST_APIKEY
>               valueFrom:
>                 secretKeyRef:
>                   name: qlik-credentials
>                   key: api-key
>             - name: BSI_QSCLOUD_CST_LOGON_USER_ID
>               valueFrom:
>                 secretKeyRef:
>                   name: qlik-credentials
>                   key: user-id
>             - name: BSI_QSCLOUD_CST_LOGON_PWD
>               valueFrom:
>                 secretKeyRef:
>                   name: qlik-credentials
>                   key: password
>             - name: BSI_QSCLOUD_CST_COLLECTION_ID
>               valueFrom:
>                 configMapKeyRef:
>                   name: qlik-config
>                   key: collection-id
>           volumeMounts:
>             - name: images-volume
>               mountPath: /nodeapp/img
>       volumes:
>         - name: images-volume
>           emptyDir: {}
>       restartPolicy: Never
>   backoffLimit: 3
> ```
>
> ::: tip The thumbnails do not need to survive the pod
> `emptyDir` is thrown away when the pod ends, which is fine here. Butler Sheet Icons uploads each
> thumbnail to Qlik Sense as it goes — the files on disk are working copies, not the result. Mount
> something durable only if you also want to keep the images yourself.
> :::
>
> ### CronJob Example
>
> ```yaml
> apiVersion: batch/v1
> kind: CronJob
> metadata:
>   name: butler-sheet-icons-cronjob
> spec:
>   schedule: "0 2 * * *" # Daily at 2 AM
>   jobTemplate:
>     spec:
>       template:
>         spec:
>           containers:
>             - name: butler-sheet-icons
>               image: ptarmiganlabs/butler-sheet-icons:4.0.0
>               args:
>                 - "qscloud"
>                 - "create-sheet-thumbnails"
>                 - "--imagedir"
>                 - "./img"
>               env:
>                 - name: BSI_QSCLOUD_CST_TENANTURL
>                   valueFrom:
>                     secretKeyRef:
>                       name: qlik-credentials
>                       key: tenant-url
>                 # ... other environment variables
>               volumeMounts:
>                 - name: images-volume
>                   mountPath: /nodeapp/img
>           volumes:
>             - name: images-volume
>               emptyDir: {}
>           restartPolicy: OnFailure
> ```
>
> ::: warning If a security policy forces a fixed user
> Where `securityContext.runAsUser` is mandatory, the image detects that it was not started as root
> and hands straight over to the user you named. That is supported, but the container can then no
> longer adapt to the volume for you — it is up to you to make sure the account can write to the
> directory given by `--imagedir`.
> :::

## Other changes to make in the same edit

- **`--imagedir /app/images` → `--imagedir ./img`, and the mount path to `/nodeapp/img`.** `/app` is
  not a path the image knows about; `/nodeapp/img` is created when the image is built, with
  ownership already set, and is what every other example on the site uses. Whether `/app/images`
  would also have worked was not tested — there is no reason to keep it either way.
- **`create-sheet-icons` → `create-sheet-thumbnails`.** Both are accepted — `create-sheet-icons` is a
  documented alias — so this is a consistency fix rather than a correction.
- **Pin the image.** `:4.0.0` rather than `:latest` for anything running on a schedule, so an
  unattended nightly job does not change version underneath you. See
  [Air-gapped environments](/guide/advanced/docker#decide-which-version-you-are-approving) for the
  full list of published tags.

---

## How this was verified

Executed on 2026-08-09 against
`ptarmiganlabs/butler-sheet-icons@sha256:20f3621e937f0b9763dac6a69a53a8979a04debca2ac2666b53785a89cd1f617`.

| Claim | How it was checked | Result |
|---|---|---|
| The path in the published manifests is wrong | `docker run --rm --entrypoint node <image> butler-sheet-icons.js --version` | `Error: Cannot find module '/nodeapp/butler-sheet-icons.js'` |
| The correct path is `src/butler-sheet-icons.js` | `docker run --rm --entrypoint node <image> src/butler-sheet-icons.js --version` | `4.0.0` |
| Passing arguments only — the `args:` form — works | `docker run --rm <image> qscloud create-sheet-thumbnails --help` | Full help text |
| The image does work in its entrypoint | `docker image inspect … --format '{{json .Config.Entrypoint}}'` | `["/sbin/tini","--","/usr/local/bin/docker-entrypoint.sh"]` |
| The entrypoint hands over when not started as root | `src/docker-entrypoint.sh` | `if [ "$(id -u)" -ne 0 ]` branch execs `node` directly |
| `create-sheet-icons` is a valid alias | `docker run --rm <image> qscloud --help` | `create-sheet-thumbnails\|create-sheet-icons` |
| Environment variable names in the manifests | `docker run --rm <image> qscloud create-sheet-thumbnails --help` | All five are correct as published |

The Kubernetes semantics — `command:` overriding `ENTRYPOINT` and `args:` overriding `CMD` — are from
the Kubernetes container specification and were **not** exercised against a live cluster. The
consequence of overriding the entrypoint was verified at the Docker level instead, by running the
image both ways.

## Note for the doc pass

`docs/guide/advanced/ci-cd.md` mentions "Kubernetes-based runners" but contains no manifests, so it
needs no change. The broken manifests exist only on `docs/examples/docker.md`.
