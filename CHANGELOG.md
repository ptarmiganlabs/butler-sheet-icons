# Changelog

## [3.10.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v3.9.0...butler-sheet-icons-v3.10.0) (2025-11-27)


### Features

* Stricter parsing and verification of numeric command line options ([9364d00](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9364d00b6c32fc9453419da2f4900868e35eb23b))


### Bug Fixes

* make browser page timeout option use the correct type (number, not string) ([cffd0e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cffd0e7f504a6dcd8c5dac5cdd5ae8efc6e5c8db))


### Miscellaneous

* **tests:** Improve unit tests for the command line options ([800e260](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/800e26013a6ba241bc5489f976fb6f1c8c7915da))


### Documentation

* Switch to using dedicated doc site for Butler Sheet Icons ([df0f460](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/df0f460239ca874a72770bf347e162a62a9ae8d4))

## [3.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v3.8.0...butler-sheet-icons-v3.9.0) (2025-11-26)


### Features

* add browser page timeout option with default value of 90 seconds ([fd75a9f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fd75a9f423240e3fe8627117b222422d5c7c3a17))
* Add software bill of materials (SBOM) as part of each release ([87d20d6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87d20d68510ccb29daef36b57df391bbe0d843e3))
* **docker:** Build separate amd64 and arm64 images ([67c8930](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/67c8930ebd11222f9a7240d4125d0e54c2aca725))
* **docker:** Build separate amd64 and arm64 images ([6011586](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60115863070830a3ee8870ead01ddf0ed4f6d2e3))
* Embed Chrome in Docker image to enable zero-setup use in air-gapped environments ([e9cb84f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e9cb84f2a24ca7fb0769f62f1ab9c222ccb40526))
* **qseow:** Add support for client-managed Qlik Sense 2025-May ([b02ada6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b02ada69144c42876542ba0a5c0a72f6862a8d3d))
* **qseow:** add support for QSEoW 2025-Nov ([12fe2af](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/12fe2af09e6a14b718150d69445003d5d9a1ee92))
* **qseow:** add support for QSEoW 2025-Nov ([2c1ec7c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c1ec7cbea6814a45dda3d609b487ab6176fb5fd))
* Update CI workflows to use Node.js 24 and Apple Silicon builds ([53caf75](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53caf75194ac7f143a00ae373f05fd8b62c40c5c))


### Bug Fixes

* **ci:** enhance keychain management when building macOS binary ([910dcaf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/910dcafe307cabe767fe4f7977c93785dc117d89))
* **ci:** enhance keychain management when building macOS binary ([d25c149](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d25c149be1d4a270f47d17ca167359a3ec201eab))
* **ci:** update Docker build on GH hosted runners ([c1a4cf9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c1a4cf92949c50e5e95fd495144a56511322e635))
* Consolidate browser launch arguments for stability and performance ([482559c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/482559c0cd68f361c8866a3ffa5f93df466e7c1f)), closes [#742](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/742)
* Make test cases work afrer upgrade of test framework ([24d2eab](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/24d2eab38e4da0ef602690e5e6d63ecbbc95d998))
* Remove invalid --sense-version option for QS Cloud commands ([3b9a228](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3b9a228b85e48c7633acc6d3c07690487e15a758))
* Resolve GPG issues in Dockerfile by cleaning and re-initializing apt ([41c571d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/41c571ddce600849a31f597139201c4aee5f3759))
* Tweak CI flow ([3ad0f8c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3ad0f8cfc8a5fca2602b24f84a427af9d5a45193))
* Update Dockerfile to use Alpine base image and install Puppeteer dependencies for improved compatibility, enable ctrl-c to abort running BSI docker containers ([4c9c4c1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4c9c4c1d1fff12757c8b99ffded05bb12a88f855))


### Miscellaneous

* **deps:** Update all dependencies to latest versions ([f77637b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f77637ba582385eb1c9ca6964c9c7c9940fa1358))
* **deps:** update dependencies and add browser page timeout option ([851ed0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/851ed0c588b68c6d61f27f18054aa974a6c85f8c))
* **deps:** Update dependencies to latest versions ([540221e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/540221e0fd7bc7f339eed7a68d2967c74b930ec4))
* Disable macOS Arm64 builds for now, will be reintroduced later. ([92b3c45](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/92b3c45a917b618e0f490ec333c0fc5434209faf))
* Enhance CI workflows with concurrency groups for macOS and Windows Docker builds ([0a49adb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0a49adb41c755291c4f8bb79df48bac908140109))
* Enhance Docker workflows for multi-architecture support and update testing documentation ([2a2b0f3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2a2b0f3eccf824b61ad6ae320f5d17aa0e734e0a))
* pin workflow action versions to improve security ([b61dafa](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b61dafa114adf27922e4e9db417a9545e4af6f43))
* pin workflow action versions to improve security ([f4e41fb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f4e41fb9e5e10e65eb17bf598a33e4d6153f6565))
* Update GitHub Actions workflows to use specific version tags for actions ([8801341](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8801341d1bbcbbf25f390d7a0f37447a855565ed))


### Documentation

* Describe how env variables can be used instead of command line parameters, refine blurring docs ([ec7fba3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ec7fba37241039193a5d9a7514bc53ab64ed4048))

## [3.9.0] - 2025-11-24

### Features

- Add support for QSEoW 2025-Nov version
- Update default `--sense-version` to `2025-Nov`

## [3.8.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v3.8.0...butler-sheet-icons-v3.8.0) (2025-05-06)

### Features

- add dotenv for environment variable management ([85f3978](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/85f39785f9a62d735273fd9bd21507172bb523a1))
- add environment variable support for command line options ([ef8ee0d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ef8ee0d0c73fa09975dcc5ef61238fc6319d92b6))
- add support for 2024-Nov Sense version in QSEoW thumbnail creation ([fcce0fe](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fcce0fe9fcdce2c07d0506e8d1d9e510de0b6e7e))

### Bug Fixes

- improve error logging for browser installation and version retrieval ([2044495](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2044495a4cb4c9d570a5b9b0206590a2347990bb))
- Remove unnecessary file movement steps in CI workflows ([970dede](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/970dedef7a0e064021870daea322683b9a41297a))

### Miscellaneous

- Add Arm64 builds ([5e55e06](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e55e060c15e7fd5626ebfc91fa6b405c2fd11b0))
- add build artifacts to .gitignore ([0bd6ce1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0bd6ce14e51ef73a1197e1425955265ed2e12cf6))
- Add commit SHA to BSI version number in insider builds ([cadb460](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cadb460136c8edd0392ef300f7b62f47bd500c42))
- Add new browser test cases ([347b3ab](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/347b3abd6f3ccc6994878c880a34a12d7c9c6d5b))
- Add tests to improve test coverage ([4464897](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4464897fee2639835aa0e6999af911cf6c6ac5c4))
- clean up CI workflow files by removing unnecessary whitespace and comments ([3224fbf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3224fbfc7d4726f29204e214bc59394c722e2dfd))
- **deps:** update puppeteer dependencies to latest versions ([22113e2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/22113e21333ebb21658648ab414c1dd945bda7be))
- Fix broken CI/CD release workflow ([e355450](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e355450caac2671ade154afe1af7df676d896473))
- Fix broken release-please ([bf523ea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bf523ea4b4390833db6ae7e582f1588df0b64277))
- **main:** release butler-sheet-icons 3.8.0 ([aa44f8c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa44f8c319fe831a9a7e5f8a8e0b3629b07fed99))
- **main:** release butler-sheet-icons 3.8.0 ([5606eac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5606eac825292c4e3e024a1bc7a1402b8d42128f))
- **main:** release butler-sheet-icons 3.8.0 ([45cfe44](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45cfe44a41c26881270fa91fa0f1535acc78f764))
- **main:** release butler-sheet-icons 3.8.0 ([1ba26f5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ba26f59a7a118f711540c6c267b07546a8e2f70))
- remove obsolete GitHub Actions workflow for building binaries ([d3d2e0f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d3d2e0f21f166c6d28c646cfb28ac2a14479c654))
- update commander, esbuild, and eslint-config-prettier to latest versions ([c0f1ffb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0f1ffbb27440618388ad29de160d8d420f14cb7))
- update dependencies to latest versions ([a543d47](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a543d47cf68c13e1863342ac6f747036da9b995c))
- update dependencies to latest versions ([90a6204](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/90a6204108cd8ec077a4aeb5c8feb8d0a1e00c54))
- update dependencies to latest versions in package.json and package-lock.json ([5411953](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/54119536e9958d45a969e5d6ea463af6e467e7ce))
- update dependencies to latest versions in package.json and package-lock.json ([ea7145e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ea7145e6b4b10968717864362a0441c4e6970b9f))
- update puppeteer-core to version 24.4.0 and add sharp to pkg assets ([601540f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/601540fcc1acbe0eda87737bf3705da444c930b6))
- update test scripts for improved execution and coverage ([f5faeb7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5faeb732e9bfb55bc5de7ba2d247a3ac5f68ea2))
- update to Node.js 23 when testing on macOS ([d0c47c1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d0c47c1aa77b9232ec237370c1f52f0e7c6e11e3))

### Documentation

- clarify multi-app support instructions in README.md ([5e4c134](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e4c134f701cf42d426ab60956274cd3abcf2721))

## 3.8.0 (2025-05-05)

### Features

- add dotenv for environment variable management ([85f3978](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/85f39785f9a62d735273fd9bd21507172bb523a1))
- add environment variable support for command line options ([ef8ee0d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ef8ee0d0c73fa09975dcc5ef61238fc6319d92b6))
- add support for 2024-Nov Sense version in QSEoW thumbnail creation ([fcce0fe](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fcce0fe9fcdce2c07d0506e8d1d9e510de0b6e7e))

### Bug Fixes

- improve error logging for browser installation and version retrieval ([2044495](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2044495a4cb4c9d570a5b9b0206590a2347990bb))
- Remove unnecessary file movement steps in CI workflows ([970dede](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/970dedef7a0e064021870daea322683b9a41297a))

### Miscellaneous

- add build artifacts to .gitignore ([0bd6ce1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0bd6ce14e51ef73a1197e1425955265ed2e12cf6))
- Add commit SHA to BSI version number in insider builds ([cadb460](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cadb460136c8edd0392ef300f7b62f47bd500c42))
- Add new browser test cases ([347b3ab](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/347b3abd6f3ccc6994878c880a34a12d7c9c6d5b))
- Add tests to improve test coverage ([4464897](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4464897fee2639835aa0e6999af911cf6c6ac5c4))
- clean up CI workflow files by removing unnecessary whitespace and comments ([3224fbf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3224fbfc7d4726f29204e214bc59394c722e2dfd))
- **deps:** update puppeteer dependencies to latest versions ([22113e2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/22113e21333ebb21658648ab414c1dd945bda7be))
- Fix broken CI/CD release workflow ([e355450](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e355450caac2671ade154afe1af7df676d896473))
- Fix broken release-please ([bf523ea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bf523ea4b4390833db6ae7e582f1588df0b64277))
- **main:** release butler-sheet-icons 3.8.0 ([45cfe44](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45cfe44a41c26881270fa91fa0f1535acc78f764))
- **main:** release butler-sheet-icons 3.8.0 ([1ba26f5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ba26f59a7a118f711540c6c267b07546a8e2f70))
- remove obsolete GitHub Actions workflow for building binaries ([d3d2e0f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d3d2e0f21f166c6d28c646cfb28ac2a14479c654))
- update commander, esbuild, and eslint-config-prettier to latest versions ([c0f1ffb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0f1ffbb27440618388ad29de160d8d420f14cb7))
- update dependencies to latest versions ([a543d47](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a543d47cf68c13e1863342ac6f747036da9b995c))
- update dependencies to latest versions ([90a6204](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/90a6204108cd8ec077a4aeb5c8feb8d0a1e00c54))
- update dependencies to latest versions in package.json and package-lock.json ([5411953](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/54119536e9958d45a969e5d6ea463af6e467e7ce))
- update dependencies to latest versions in package.json and package-lock.json ([ea7145e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ea7145e6b4b10968717864362a0441c4e6970b9f))
- update puppeteer-core to version 24.4.0 and add sharp to pkg assets ([601540f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/601540fcc1acbe0eda87737bf3705da444c930b6))
- update test scripts for improved execution and coverage ([f5faeb7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5faeb732e9bfb55bc5de7ba2d247a3ac5f68ea2))
- update to Node.js 23 when testing on macOS ([d0c47c1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d0c47c1aa77b9232ec237370c1f52f0e7c6e11e3))

### Documentation

- clarify multi-app support instructions in README.md ([5e4c134](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e4c134f701cf42d426ab60956274cd3abcf2721))
