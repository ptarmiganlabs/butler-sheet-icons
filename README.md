# Butler Sheet Icons

<!-- markdownlint-disable MD033 MD045 -->

<p align="center"><img src="docs/butler sheet icons_small.png" alt="Butler Sheet Icons logo"><p>
<h3 align="center">Automatically create Qlik Sense sheet thumbnail images</h3>
</p>

---

<p align="center">
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons"><img src="https://img.shields.io/badge/Source---" alt="Source"></a>
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/ci.yaml"><img src="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/ci.yaml/badge.svg?branch=main" alt="Build status"></a>
<a href="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/docker-image-build.yaml"><img src="https://github.com/ptarmiganlabs/butler-sheet-icons/actions/workflows/docker-image-build.yaml/badge.svg" alt="Docker image build"></a>
<a href="https://www.repostatus.org/#active"><img src="https://www.repostatus.org/badges/latest/active.svg" alt="Project Status: Active"></a>
</p>

---

A cross-platform, command-line tool (plus Docker!) for creating sheet thumbnails based on the actual layout of sheets in Qlik Sense apps.

Works on both Qlik Sense Cloud apps and Qlik Sense Enterprise on Windows (QSEoW) apps.

## Key Features

- Cross-platform support: Windows, macOS, Linux, and Docker.
- Automatically create sheet thumbnails based on actual sheet layouts.
- Supports Qlik Sense Cloud and Qlik Sense Enterprise on Windows (QSEoW).
- Multi-app support using tags (QSEoW) or collections (QS Cloud).
- Ability to exclude or blur specific sheets.
- Stand-alone binaries available for easy installation.
- Integration with CI/CD pipelines.

## Why Butler Sheet Icons?

Butler Sheet Icons ("BSI") removes the manual toil of curating sheet icons by mimicking how real users navigate Sense apps, capturing screenshots, processing them, and pushing the results back through the Sense APIs. Whether you are updating a single flagship dashboard or every app tagged for a release, BSI keeps thumbnails accurate and consistent.

Teams use BSI everywhere from ad-hoc desktop scripting to Dockerized CI/CD jobs. Built-in browser automation, sheet exclusion/blur filters, and environment-variable driven configs make it fit both quick experiments and enterprise deployments.

## Documentation (Start Here)

**👉 All installation guides, configuration references, examples, and troubleshooting now live at [butler-sheet-icons.ptarmiganlabs.com](https://butler-sheet-icons.ptarmiganlabs.com).**

The documentation site covers:

- Quick start flows for Qlik Sense Cloud and QSEoW
- Installation options (standalone binaries, Docker, Node.js)
- Command/option references and environment variables
- Hands-on examples, supported Sense versions, and troubleshooting tips

## Get Going

1. [Download the latest release](https://github.com/ptarmiganlabs/butler-sheet-icons/releases/latest) for your platform (Windows, macOS, Linux, Docker).
2. Head to the [Quick Start guide](https://butler-sheet-icons.ptarmiganlabs.com/guide/quick-start) to configure credentials, certificates, and first runs.
3. Explore advanced topics (collections/tags, blurring, CI/CD) in the [Guide](https://butler-sheet-icons.ptarmiganlabs.com/guide/introduction) and [Reference](https://butler-sheet-icons.ptarmiganlabs.com/reference/commands) sections.

---

Butler Sheet Icons is an open-source project sponsored by [Ptarmigan Labs](https://ptarmiganlabs.com). For support and services relating to the Butler family of tools or Qlik Sense projects in general, please contact info -at- ptarmiganlabs -dot- com, or [sign up to the newsletter](https://ptarmiganlabs.com/#/portal/signup) to get the latest updates.
