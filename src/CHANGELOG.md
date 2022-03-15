# Changelog

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.9...butler-sheet-icons-v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add macOS build to CI ([9c1e307](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9c1e3079fba7b8606fc5cd4f69c0528a46b69034))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* ci debug ([150b0ff](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/150b0ffa7265d7a9a5f251d6d9e2dcf09defb8a8))
* ci debug ([5e561c7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e561c71013b547737df0af72b207bcc7f543ba9))
* ci debug ([a4f081c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4f081cecab6bcc71b456b3bcd5fd26bb9477cee))
* ci debug ([699b490](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/699b4900870622c2ce3c0362793734c53df22c00))
* ci debug ([0b8a58d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b8a58d10f4826f7d4c1e06960b307a5c3d08785))
* ci debug ([c14eb24](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c14eb2464be453634b953adb9077a00ce4c9dd99))
* ci debug ([70b3742](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/70b3742a99297da632601a818a61b960b46b649e))
* ci debug ([b5cb220](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b5cb220c8b05e7ef32135658c7d60e3e8209affa))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* ci debug 3 ([39ade54](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/39ade54a6aa976581177a2620ec058814fdfa155))
* ci debug 4 ([7fa175f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7fa175f56d66c8b78942b200cff96bff523e2439))
* ci debug2 ([6357f44](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6357f446f6da49c24f61b4fd58da2dbf5c805d1a))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Disable tests ([56fdcf7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56fdcf78fd074277740b116bfe57d04ae838c6c0))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Fix Snyk scanning ([129da2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/129da2b7d93552c8737acfc820912f7908c72f06))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* Snyk ([cc077d9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc077d942f1e2046bdce284c7ea9ae348b6f05dd))
* Snyk ([3679ddb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3679ddb93b7e7e86331487c42f52573b625eadb0))
* Snyk CI config ([cfceb5a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cfceb5a6ef1d98c6cad61a276bd5a9a1fedfdc94))
* Snyk CI config ([f1ea388](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1ea3883c968cb85340e00a6441abe0819e72994))
* Snyk CI config ([1ec1c63](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ec1c63a643a6add4cbd05f95313fa1391579b73))
* Snyk config ([8564657](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/85646573566128a64fb8d2ec3539dc522748c65c))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* add Snyk scanning ([a67be0a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a67be0aef146f833cc3982dade55c883808c2a1b))
* add Snyk scanning ([d25f234](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d25f23420a83bbdff451ed2b9a4d9d2e12c739f6))
* **deps:** pin dependencies ([687dd42](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/687dd42d0e4c32ba2111152ff5f669a7d82bf504))
* **deps:** pin dependency jest to 27.0.6 ([2511675](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2511675db051b9eb1e53450fcf440b1824029379))
* **deps:** pin dependency jest to 27.1.0 ([#10](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/10)) ([ecd61d5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ecd61d5a6d8074926c25fe6e67663c853fb091d5))
* **deps:** pin dependency jest to 27.1.1 ([64225ee](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64225ee6741b72d45934e497edd2ab4c82f465d0))
* **deps:** pin dependency jest to 27.2.0 ([9774c9c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9774c9ce59fdec4d97f7bc678cf14a81c5cbaab9))
* **deps:** Update dependencies ([656f62e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/656f62eee3e09646c115eb01163ca0afb4be4854))
* **deps:** Update dependencies ([277d3bc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/277d3bc25f885038bc94b11ccee860ebb3ef65a8))
* **deps:** update dependency jest to v27.2.1 ([0851ef0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0851ef0b6bdbd97ad22c13a8bf76727918931095))
* **deps:** update dependency jest to v27.2.3 ([1ddedce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ddedcee0027068088f84745f704ae7a0be0f0fc))
* **deps:** update dependency jest to v27.2.5 ([caacfd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caacfd324dcaac6ed6118546995601627b5ae2d3))
* **deps:** update dependency jest to v27.3.1 ([c3ccbfe](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c3ccbfee9e108808886e497802309722bf4f1b2c))
* **deps:** update dependency jest to v27.4.4 ([45e4936](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45e49369607c410e33842511dc9b2c3f38efa4d7))
* **deps:** update dependency jest to v27.4.7 ([30a6aac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/30a6aacfe7c046e4248f1f443d6e7e875d3af40e))
* **deps:** update dependency snyk to v1.720.0 ([5bb5d4b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5bb5d4bd6a0007271f7eab419b851d8346dd1bca))
* **deps:** update dependency snyk to v1.722.0 ([c488b84](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c488b84f73c6ec9e521577f2c394de607089083a))
* **deps:** update dependency snyk to v1.723.0 ([cadfd18](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cadfd18794c7eed1fa364b0820e48e7e3fb1adae))
* **deps:** update dependency snyk to v1.725.0 ([6952419](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/69524195971262c9265c4daa943604a5b4c8af31))
* **deps:** update dependency snyk to v1.726.0 ([a3f1142](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a3f1142f2fec89d933815316af117b0482bd8d75))
* **deps:** update dependency snyk to v1.727.0 ([3a4b61b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3a4b61b711a2859a40ed79f8a8f8ce21cf2eedf2))
* **deps:** update dependency snyk to v1.730.0 ([eb43937](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eb439372aebce349d9cea0dc610e080e69607391))
* **deps:** update dependency snyk to v1.731.0 ([e95c905](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e95c905090c4a3fd0f864c09272406f4c966365f))
* **deps:** update dependency snyk to v1.733.0 ([7d9f644](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7d9f644c3cf8c29e8dbf71f5410b01052e43081a))
* **deps:** update dependency snyk to v1.736.0 ([dc770c2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dc770c2cf2c95c72c79c66690eaac75ab1df2eb7))
* **deps:** update dependency snyk to v1.741.0 ([2c23796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c23796edfbba9a5a390d6c6ced7569145489b6f))
* **deps:** update dependency snyk to v1.742.0 ([4bc3649](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4bc3649e4fc50b8a81e93ae5faeb5b51cc4e6932))
* **deps:** update dependency snyk to v1.788.0 ([285815c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/285815c7e6643b2ca522c86f1e79b31e1b25d1be))
* **deps:** update dependency snyk to v1.826.0 ([3fb8a40](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3fb8a40ffe43a0265c8cd9e8dc3e5ac550f8b83d))
* **deps:** update dependency snyk to v1.840.0 ([75d51e0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/75d51e0b3488bd411880097b5c3729789e743a6d))
* **deps:** update dependency snyk to v1.872.0 ([a7fd375](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a7fd375f6f859bf32c85cd1ad453d9712f4e13dd))
* **deps:** update googlecloudplatform/release-please-action action to v2.32.0 ([2f36a5e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2f36a5e304fb963c79cf09aa133f71bb2184a89a))
* **deps:** Updated dependencies ([90293fd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/90293fd5118d25a8bd91d6acf80ecdd63d837411))
* **deps:** Updated dependencies ([ee87838](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ee878386f6c29c4c62b7c453b72af001db990830))
* **deps:** Updated dependencies ([452cb64](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/452cb643f47da8124f5fbad44378bf7f0017735b))
* **main:** release 1.9.0 ([61ca993](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61ca993a4f106b138c1cc9253658c864279f7a84))
* **main:** release 1.9.0 ([c0b5855](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0b585543ac79dd7352530bd37727ea5b5c0cf9c))
* **main:** release 1.9.0 ([5ed3e1d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5ed3e1d4d2586cb7c6d6cc3440c6cfb9ecf2596e))
* **main:** release butler-sheet-icons 1.2.0 ([e013279](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e0132797207eec93d6faae4075ec27dd001fe3df))
* **main:** release butler-sheet-icons 1.2.1 ([450fb82](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/450fb826422d4d5fb3012b191b80c05d19822b81))
* **main:** release butler-sheet-icons 1.3.0 ([6b8eb29](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6b8eb29361ebf73e50e8b0cb3955e61fbcd4b0d3))
* **main:** release butler-sheet-icons 1.9.0 ([3e0390e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0390e48723291a0bfe9b868200b70322f718c8))
* **main:** release butler-sheet-icons 1.9.0 ([9148065](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9148065a0aa00c64940d4c809891e67ecbee760f))
* **main:** release butler-sheet-icons 1.9.2 ([b728ea1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b728ea157af5298d8d7dc87b0c05c71a7d2030ba))
* **main:** release butler-sheet-icons 1.9.3 ([af98d5d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/af98d5d873050adb37e26371a7d7dacaeae88375))
* **main:** release butler-sheet-icons 1.9.4 ([#173](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/173)) ([0fab86a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0fab86ae840e665012765e738ba6d774a852fafe))
* **main:** release butler-sheet-icons 1.9.6 ([0aa55a5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0aa55a51bdf318c54cdea0ca116f69203f1aa9c1))
* **main:** release butler-sheet-icons 1.9.7 ([fa5da7c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fa5da7c845b50f82559fb68a976782c0c7be3e82))
* **main:** release butler-sheet-icons 1.9.8 ([1dc47de](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1dc47deff34cd63c6068372fd3964abd17e23db3))
* **main:** release butler-sheet-icons 1.9.9 ([b17bc02](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b17bc02aeae2871b2fb44edb50517b4ba2d22ff2))
* **main:** release butler-sheet-icons 2.0.0-alpha1 ([51be546](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/51be5466124c3d1dc619a74f06cf080cb5883dae))
* **main:** release butler-sheet-icons 2.0.0-alpha3 ([5352123](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53521230c0c9243dd4adfd4a783843f9e44bb6fb))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* release 1.0.0 ([#2](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/2)) ([4d9299a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4d9299a24563fb514e9f08caddf863f8b6abff45))
* release 1.0.1 ([#3](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/3)) ([1b26d76](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b26d7656304a28ab4fc4967919a9c562a7425b9))
* release 1.0.2 ([#4](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/4)) ([b737f99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b737f993640ba106cfbf8ace84c8b150090ffb88))
* release 1.0.3 ([#12](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/12)) ([11029d2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/11029d24afd0cf19cb48552a40d56cf668a24368))
* release 1.0.4 ([4f5fce4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4f5fce487643d7089f36d90e1cdbcfeae6a9e9bf))
* release main ([caf14e6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caf14e610c92bc727e3fb04faa0fa3b67d0232d2))
* release main ([d513926](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d5139261d79ef9a3406676a163ab7b43e3b99675))
* release main ([cd8d1bf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cd8d1bf9f2c614162328c1d57e4cd0a9c9c71e75))
* release main ([df94cdf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/df94cdfa8ef38d04e9758f42c8790d6e12319f5c))
* release main ([d190f2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d190f2b37b327a6551f58424f4e853fc98fb88e6))
* release main ([80eb039](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80eb03952fb5a7d047ab47fc5c0e6e71d282cc58))
* release main ([80b64cd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80b64cd876f8973756d0f1f30d1e4014e50f1307))
* release main ([f1a13f2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1a13f222489548018b86c49b02582c97c8baa6c))
* release main ([aad25dc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aad25dc2b82c9a929d044c3f0ad880f916a2214d))
* release main ([6200233](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/62002332a4a12086cbebb8b489cb0f76034cdd9d))
* release main ([67b5b1f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/67b5b1f474b48c302b4669d392ef26dbb8a7522a))
* release main ([2c3580e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c3580ef9736e462e065b8eae401784ddb86852e))
* release main ([8426ca3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8426ca35d876d4f0a8b57c03794868269664134f))
* release main ([eeca002](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeca002f1cd3e59f65cf29cdb33b0dd76b450050))
* release main ([d404b8d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d404b8d09b8b78a1ca0e3630e0bcedb5db50c7bf))
* release main ([5fd9fd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5fd9fd3fb442842023f232b9fc7b3885b60a2bde))
* release main ([#61](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/61)) ([a5cb515](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a5cb51533e7a7c211a750cdb21c45073a0c3b898))
* release main ([#64](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/64)) ([9734406](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/97344065897efa1e30c09931dacf5208f516b4cd))
* release main ([#65](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/65)) ([99b0fc2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/99b0fc223d5eec8f54529ed03a1ecdb6a87cdd80))
* release main ([#66](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/66)) ([0b9b735](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b9b73549bef0a235f4f062e9aaafe315263bd84))
* release main ([#67](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/67)) ([bd20362](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd2036223f108507bf36c3ccc4fa5bc1bbac3156))
* release main ([#69](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/69)) ([2d60408](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d6040854119b1e3923a69acfb07c45757afe7fe))
* release main ([#73](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/73)) ([e44765c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e44765cfb73bff9b87de1fb825a9e46b534ce76e))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update dependencies ([13f0c67](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/13f0c679b9afb4ad48150f29bb0512a9b18e6dcb))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))
* Update deps, fix spelling typo ([189302b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/189302bf09661ab7e92bf9339f1af8c2e26c901e))
* Use latest & greatest foundation for created Docker images ([1655ba3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1655ba3d233ae9d8aeb41bfbc1915e7103bc52ca))

### [1.9.9](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.8...butler-sheet-icons-v1.9.9) (2022-03-15)


### Bug Fixes

* Add macOS build to CI ([9c1e307](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9c1e3079fba7b8606fc5cd4f69c0528a46b69034))
* Fix Snyk scanning ([129da2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/129da2b7d93552c8737acfc820912f7908c72f06))
* Snyk CI config ([cfceb5a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cfceb5a6ef1d98c6cad61a276bd5a9a1fedfdc94))
* Snyk CI config ([f1ea388](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1ea3883c968cb85340e00a6441abe0819e72994))
* Snyk CI config ([1ec1c63](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ec1c63a643a6add4cbd05f95313fa1391579b73))
* Snyk config ([8564657](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/85646573566128a64fb8d2ec3539dc522748c65c))


### Miscellaneous

* **deps:** update dependency snyk to v1.872.0 ([a7fd375](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a7fd375f6f859bf32c85cd1ad453d9712f4e13dd))

### [1.9.8](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.7...butler-sheet-icons-v1.9.8) (2022-03-15)


### Bug Fixes

* ci debug 3 ([39ade54](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/39ade54a6aa976581177a2620ec058814fdfa155))
* ci debug 4 ([7fa175f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7fa175f56d66c8b78942b200cff96bff523e2439))

### [1.9.7](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.6...butler-sheet-icons-v1.9.7) (2022-03-15)


### Bug Fixes

* ci debug2 ([6357f44](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6357f446f6da49c24f61b4fd58da2dbf5c805d1a))

### 1.9.6 (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)


### Bug Fixes

* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* ci debug ([150b0ff](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/150b0ffa7265d7a9a5f251d6d9e2dcf09defb8a8))
* ci debug ([5e561c7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e561c71013b547737df0af72b207bcc7f543ba9))
* ci debug ([a4f081c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4f081cecab6bcc71b456b3bcd5fd26bb9477cee))
* ci debug ([699b490](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/699b4900870622c2ce3c0362793734c53df22c00))
* ci debug ([0b8a58d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b8a58d10f4826f7d4c1e06960b307a5c3d08785))
* ci debug ([c14eb24](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c14eb2464be453634b953adb9077a00ce4c9dd99))
* ci debug ([70b3742](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/70b3742a99297da632601a818a61b960b46b649e))
* ci debug ([b5cb220](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b5cb220c8b05e7ef32135658c7d60e3e8209affa))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)


### Documentation

* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))


### Miscellaneous

* **main:** release 1.9.0 ([61ca993](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61ca993a4f106b138c1cc9253658c864279f7a84))
* **main:** release 1.9.0 ([c0b5855](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0b585543ac79dd7352530bd37727ea5b5c0cf9c))
* **main:** release 1.9.0 ([5ed3e1d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5ed3e1d4d2586cb7c6d6cc3440c6cfb9ecf2596e))
* **main:** release butler-sheet-icons 1.9.0 ([3e0390e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0390e48723291a0bfe9b868200b70322f718c8))
* **main:** release butler-sheet-icons 1.9.0 ([9148065](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9148065a0aa00c64940d4c809891e67ecbee760f))
* **main:** release butler-sheet-icons 1.9.2 ([b728ea1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b728ea157af5298d8d7dc87b0c05c71a7d2030ba))
* **main:** release butler-sheet-icons 1.9.3 ([af98d5d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/af98d5d873050adb37e26371a7d7dacaeae88375))
* **main:** release butler-sheet-icons 1.9.4 ([#173](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/173)) ([0fab86a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0fab86ae840e665012765e738ba6d774a852fafe))
* **main:** release butler-sheet-icons 2.0.0-alpha1 ([51be546](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/51be5466124c3d1dc619a74f06cf080cb5883dae))
* **main:** release butler-sheet-icons 2.0.0-alpha3 ([5352123](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53521230c0c9243dd4adfd4a783843f9e44bb6fb))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.4...butler-sheet-icons-v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)


### Bug Fixes

* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* ci debug ([699b490](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/699b4900870622c2ce3c0362793734c53df22c00))
* ci debug ([0b8a58d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b8a58d10f4826f7d4c1e06960b307a5c3d08785))
* ci debug ([c14eb24](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c14eb2464be453634b953adb9077a00ce4c9dd99))
* ci debug ([70b3742](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/70b3742a99297da632601a818a61b960b46b649e))
* ci debug ([b5cb220](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b5cb220c8b05e7ef32135658c7d60e3e8209affa))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)


### Documentation

* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))


### Miscellaneous

* **main:** release 1.9.0 ([61ca993](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61ca993a4f106b138c1cc9253658c864279f7a84))
* **main:** release 1.9.0 ([c0b5855](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0b585543ac79dd7352530bd37727ea5b5c0cf9c))
* **main:** release 1.9.0 ([5ed3e1d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5ed3e1d4d2586cb7c6d6cc3440c6cfb9ecf2596e))
* **main:** release butler-sheet-icons 1.9.0 ([9148065](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9148065a0aa00c64940d4c809891e67ecbee760f))
* **main:** release butler-sheet-icons 1.9.2 ([b728ea1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b728ea157af5298d8d7dc87b0c05c71a7d2030ba))
* **main:** release butler-sheet-icons 1.9.3 ([af98d5d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/af98d5d873050adb37e26371a7d7dacaeae88375))
* **main:** release butler-sheet-icons 1.9.4 ([#173](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/173)) ([0fab86a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0fab86ae840e665012765e738ba6d774a852fafe))
* **main:** release butler-sheet-icons 2.0.0-alpha1 ([51be546](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/51be5466124c3d1dc619a74f06cf080cb5883dae))
* **main:** release butler-sheet-icons 2.0.0-alpha3 ([5352123](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53521230c0c9243dd4adfd4a783843f9e44bb6fb))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))

### [1.9.4](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.3...butler-sheet-icons-v1.9.4) (2022-03-15)


### Bug Fixes

* ci debug ([0b8a58d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b8a58d10f4826f7d4c1e06960b307a5c3d08785))

### [1.9.3](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.9.2...butler-sheet-icons-v1.9.3) (2022-03-15)


### Bug Fixes

* ci debug ([c14eb24](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c14eb2464be453634b953adb9077a00ce4c9dd99))
* ci debug ([70b3742](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/70b3742a99297da632601a818a61b960b46b649e))

### 1.9.2 (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)


### Bug Fixes

* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* ci debug ([b5cb220](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b5cb220c8b05e7ef32135658c7d60e3e8209affa))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)


### Documentation

* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))


### Miscellaneous

* **main:** release 1.9.0 ([61ca993](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61ca993a4f106b138c1cc9253658c864279f7a84))
* **main:** release 1.9.0 ([c0b5855](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c0b585543ac79dd7352530bd37727ea5b5c0cf9c))
* **main:** release 1.9.0 ([5ed3e1d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5ed3e1d4d2586cb7c6d6cc3440c6cfb9ecf2596e))
* **main:** release butler-sheet-icons 1.9.0 ([9148065](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9148065a0aa00c64940d4c809891e67ecbee760f))
* **main:** release butler-sheet-icons 2.0.0-alpha1 ([51be546](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/51be5466124c3d1dc619a74f06cf080cb5883dae))
* **main:** release butler-sheet-icons 2.0.0-alpha3 ([5352123](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53521230c0c9243dd4adfd4a783843f9e44bb6fb))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.9.0...v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.9.0...v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.0.4...v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))

## [1.9.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v2.0.0-alpha3...butler-sheet-icons-v1.9.0) (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* CI debug ([7794d4f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7794d4fff36bf8ac532e9611b82a014fc0eab049))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* add Snyk scanning ([a67be0a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a67be0aef146f833cc3982dade55c883808c2a1b))
* add Snyk scanning ([d25f234](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d25f23420a83bbdff451ed2b9a4d9d2e12c739f6))
* **deps:** pin dependencies ([687dd42](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/687dd42d0e4c32ba2111152ff5f669a7d82bf504))
* **deps:** pin dependency jest to 27.0.6 ([2511675](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2511675db051b9eb1e53450fcf440b1824029379))
* **deps:** pin dependency jest to 27.1.0 ([#10](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/10)) ([ecd61d5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ecd61d5a6d8074926c25fe6e67663c853fb091d5))
* **deps:** pin dependency jest to 27.1.1 ([64225ee](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64225ee6741b72d45934e497edd2ab4c82f465d0))
* **deps:** pin dependency jest to 27.2.0 ([9774c9c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9774c9ce59fdec4d97f7bc678cf14a81c5cbaab9))
* **deps:** Update dependencies ([656f62e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/656f62eee3e09646c115eb01163ca0afb4be4854))
* **deps:** Update dependencies ([277d3bc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/277d3bc25f885038bc94b11ccee860ebb3ef65a8))
* **deps:** update dependency jest to v27.2.1 ([0851ef0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0851ef0b6bdbd97ad22c13a8bf76727918931095))
* **deps:** update dependency jest to v27.2.3 ([1ddedce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ddedcee0027068088f84745f704ae7a0be0f0fc))
* **deps:** update dependency jest to v27.2.5 ([caacfd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caacfd324dcaac6ed6118546995601627b5ae2d3))
* **deps:** update dependency jest to v27.3.1 ([c3ccbfe](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c3ccbfee9e108808886e497802309722bf4f1b2c))
* **deps:** update dependency jest to v27.4.4 ([45e4936](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45e49369607c410e33842511dc9b2c3f38efa4d7))
* **deps:** update dependency jest to v27.4.7 ([30a6aac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/30a6aacfe7c046e4248f1f443d6e7e875d3af40e))
* **deps:** update dependency snyk to v1.720.0 ([5bb5d4b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5bb5d4bd6a0007271f7eab419b851d8346dd1bca))
* **deps:** update dependency snyk to v1.722.0 ([c488b84](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c488b84f73c6ec9e521577f2c394de607089083a))
* **deps:** update dependency snyk to v1.723.0 ([cadfd18](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cadfd18794c7eed1fa364b0820e48e7e3fb1adae))
* **deps:** update dependency snyk to v1.725.0 ([6952419](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/69524195971262c9265c4daa943604a5b4c8af31))
* **deps:** update dependency snyk to v1.726.0 ([a3f1142](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a3f1142f2fec89d933815316af117b0482bd8d75))
* **deps:** update dependency snyk to v1.727.0 ([3a4b61b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3a4b61b711a2859a40ed79f8a8f8ce21cf2eedf2))
* **deps:** update dependency snyk to v1.730.0 ([eb43937](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eb439372aebce349d9cea0dc610e080e69607391))
* **deps:** update dependency snyk to v1.731.0 ([e95c905](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e95c905090c4a3fd0f864c09272406f4c966365f))
* **deps:** update dependency snyk to v1.733.0 ([7d9f644](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7d9f644c3cf8c29e8dbf71f5410b01052e43081a))
* **deps:** update dependency snyk to v1.736.0 ([dc770c2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dc770c2cf2c95c72c79c66690eaac75ab1df2eb7))
* **deps:** update dependency snyk to v1.741.0 ([2c23796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c23796edfbba9a5a390d6c6ced7569145489b6f))
* **deps:** update dependency snyk to v1.742.0 ([4bc3649](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4bc3649e4fc50b8a81e93ae5faeb5b51cc4e6932))
* **deps:** update dependency snyk to v1.788.0 ([285815c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/285815c7e6643b2ca522c86f1e79b31e1b25d1be))
* **deps:** update dependency snyk to v1.826.0 ([3fb8a40](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3fb8a40ffe43a0265c8cd9e8dc3e5ac550f8b83d))
* **deps:** update dependency snyk to v1.840.0 ([75d51e0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/75d51e0b3488bd411880097b5c3729789e743a6d))
* **deps:** update googlecloudplatform/release-please-action action to v2.32.0 ([2f36a5e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2f36a5e304fb963c79cf09aa133f71bb2184a89a))
* **deps:** Updated dependencies ([90293fd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/90293fd5118d25a8bd91d6acf80ecdd63d837411))
* **deps:** Updated dependencies ([ee87838](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ee878386f6c29c4c62b7c453b72af001db990830))
* **deps:** Updated dependencies ([452cb64](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/452cb643f47da8124f5fbad44378bf7f0017735b))
* **main:** release butler-sheet-icons 1.2.0 ([e013279](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e0132797207eec93d6faae4075ec27dd001fe3df))
* **main:** release butler-sheet-icons 1.2.1 ([450fb82](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/450fb826422d4d5fb3012b191b80c05d19822b81))
* **main:** release butler-sheet-icons 1.3.0 ([6b8eb29](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6b8eb29361ebf73e50e8b0cb3955e61fbcd4b0d3))
* **main:** release butler-sheet-icons 2.0.0-alpha1 ([51be546](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/51be5466124c3d1dc619a74f06cf080cb5883dae))
* **main:** release butler-sheet-icons 2.0.0-alpha3 ([5352123](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53521230c0c9243dd4adfd4a783843f9e44bb6fb))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* release 1.0.0 ([#2](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/2)) ([4d9299a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4d9299a24563fb514e9f08caddf863f8b6abff45))
* release 1.0.1 ([#3](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/3)) ([1b26d76](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b26d7656304a28ab4fc4967919a9c562a7425b9))
* release 1.0.2 ([#4](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/4)) ([b737f99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b737f993640ba106cfbf8ace84c8b150090ffb88))
* release 1.0.3 ([#12](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/12)) ([11029d2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/11029d24afd0cf19cb48552a40d56cf668a24368))
* release 1.0.4 ([4f5fce4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4f5fce487643d7089f36d90e1cdbcfeae6a9e9bf))
* release main ([caf14e6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caf14e610c92bc727e3fb04faa0fa3b67d0232d2))
* release main ([d513926](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d5139261d79ef9a3406676a163ab7b43e3b99675))
* release main ([cd8d1bf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cd8d1bf9f2c614162328c1d57e4cd0a9c9c71e75))
* release main ([df94cdf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/df94cdfa8ef38d04e9758f42c8790d6e12319f5c))
* release main ([d190f2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d190f2b37b327a6551f58424f4e853fc98fb88e6))
* release main ([80eb039](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80eb03952fb5a7d047ab47fc5c0e6e71d282cc58))
* release main ([80b64cd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80b64cd876f8973756d0f1f30d1e4014e50f1307))
* release main ([f1a13f2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1a13f222489548018b86c49b02582c97c8baa6c))
* release main ([aad25dc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aad25dc2b82c9a929d044c3f0ad880f916a2214d))
* release main ([6200233](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/62002332a4a12086cbebb8b489cb0f76034cdd9d))
* release main ([67b5b1f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/67b5b1f474b48c302b4669d392ef26dbb8a7522a))
* release main ([2c3580e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c3580ef9736e462e065b8eae401784ddb86852e))
* release main ([8426ca3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8426ca35d876d4f0a8b57c03794868269664134f))
* release main ([eeca002](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeca002f1cd3e59f65cf29cdb33b0dd76b450050))
* release main ([d404b8d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d404b8d09b8b78a1ca0e3630e0bcedb5db50c7bf))
* release main ([5fd9fd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5fd9fd3fb442842023f232b9fc7b3885b60a2bde))
* release main ([#61](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/61)) ([a5cb515](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a5cb51533e7a7c211a750cdb21c45073a0c3b898))
* release main ([#64](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/64)) ([9734406](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/97344065897efa1e30c09931dacf5208f516b4cd))
* release main ([#65](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/65)) ([99b0fc2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/99b0fc223d5eec8f54529ed03a1ecdb6a87cdd80))
* release main ([#66](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/66)) ([0b9b735](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b9b73549bef0a235f4f062e9aaafe315263bd84))
* release main ([#67](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/67)) ([bd20362](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd2036223f108507bf36c3ccc4fa5bc1bbac3156))
* release main ([#69](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/69)) ([2d60408](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d6040854119b1e3923a69acfb07c45757afe7fe))
* release main ([#73](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/73)) ([e44765c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e44765cfb73bff9b87de1fb825a9e46b534ce76e))
* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update dependencies ([13f0c67](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/13f0c679b9afb4ad48150f29bb0512a9b18e6dcb))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))
* Update deps, fix spelling typo ([189302b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/189302bf09661ab7e92bf9339f1af8c2e26c901e))
* Use latest & greatest foundation for created Docker images ([1655ba3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1655ba3d233ae9d8aeb41bfbc1915e7103bc52ca))

## [2.0.0-alpha3](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v2.0.0-alpha1...butler-sheet-icons-v2.0.0-alpha3) (2022-03-15)


### Documentation

* Dummy update ([c2d9383](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2d93836a5ef68f858379f76ee7eba96db1c84f6))


### Miscellaneous

* Tweak CI ([1c6b9e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c6b9e4bcb4e6d01f22b821727a735b58080e394))
* tweaking CI ([f5b9168](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f5b91680e3d8c858452e392eebe1a877b913167f))

## 2.0.0-alpha1 (2022-03-15)


### ⚠ BREAKING CHANGES

* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud
* Sheet thumbnails for Qlik Sense Cloud apps

### Features

* Add command for listing all available QS Cloud collections ([a173bf4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a173bf4cd7ded1d29bb47e96775e9659cac9e44e))
* Add qscloud list-collections command ([b19d92b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b19d92b6c4d4f4f02d2775b69cf10d933bf84627))
* Add Snyk test and  binaries building ([2c09927](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c0992728731ff3018e8e91862c5f2fdd6f36aa6))
* Build stand-alone binaries for Windows, Linux and macOS ([aa17a3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aa17a3c7d79d2c6b74f76c83063a8a238022d6f6)), closes [#148](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/148)
* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Make app selection additive across appid/tags and appid/collections ([223d80a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/223d80a22c9b4d3ea04a8e62ee1c35c7a5a3dbcd)), closes [#142](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/142)
* Make cert validation optional ([ab3e331](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)
* Sheet thumbnails for Qlik Sense Cloud apps ([59f0c5b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/59f0c5bd743b70347ad5a42b966665b1dad31074)), closes [#123](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/123)
* Store screenshots in app-specific folders, separate for QSEoW and QS Cloud ([eeb7633](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeb763317f3bce5469ec06f96e7e519244565e86)), closes [#124](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/124)
* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* add comments ([de5b041](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))
* Add more detail in QSEoW thumbnail images ([ffb5942](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ffb5942d6a35c1c7a2e0217616a1c37e6d1a5d91)), closes [#122](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/122)
* Add README file ([d40d429](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))
* Adopt QSEoW test cases to new command/sub-command structure ([1ef5829](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef5829108d352281dced987fbb3734172f55d53)), closes [#139](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/139)
* app name in package.json ([ff35688](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))
* Fix failing Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))
* Handle bool or string for --headless option ([64aa66a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64aa66a761c0e6525d349b11347c5ac5ba65a26f)), closes [#121](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/121)
* improved info texts in app ([1934e0c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))
* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))
* Twaeking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))
* Tweaking Docker builds ([18b43d0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))
* Tweaking Docker builds ([#63](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))
* Update dependencies ([2174796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))
* Updated dependencies ([db95b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))


### Documentation

* . ([56c5f55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))
* . ([61b385c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))
* . ([4b7616f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))
* . ([78849b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))
* . ([2eb8251](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))
* . ([6cb7a8a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))
* . ([63733eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))
* . ([60ba008](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))
* add basic jsdoc to functions in source code ([61b6bea](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/61b6beaa261c7bd4cd1d99d34a05d70c7fd0b144))
* Docker build debugging ([925c2c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))
* release process wip ([87b90ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))
* release process wip ([a222293](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))
* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))
* Update src readme ([b058b5f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))
* wip ([6a25789](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))


### Miscellaneous

* add Snyk scanning ([a67be0a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a67be0aef146f833cc3982dade55c883808c2a1b))
* add Snyk scanning ([d25f234](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d25f23420a83bbdff451ed2b9a4d9d2e12c739f6))
* **deps:** pin dependencies ([687dd42](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/687dd42d0e4c32ba2111152ff5f669a7d82bf504))
* **deps:** pin dependency jest to 27.0.6 ([2511675](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2511675db051b9eb1e53450fcf440b1824029379))
* **deps:** pin dependency jest to 27.1.0 ([#10](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/10)) ([ecd61d5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ecd61d5a6d8074926c25fe6e67663c853fb091d5))
* **deps:** pin dependency jest to 27.1.1 ([64225ee](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/64225ee6741b72d45934e497edd2ab4c82f465d0))
* **deps:** pin dependency jest to 27.2.0 ([9774c9c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9774c9ce59fdec4d97f7bc678cf14a81c5cbaab9))
* **deps:** Update dependencies ([656f62e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/656f62eee3e09646c115eb01163ca0afb4be4854))
* **deps:** Update dependencies ([277d3bc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/277d3bc25f885038bc94b11ccee860ebb3ef65a8))
* **deps:** update dependency jest to v27.2.1 ([0851ef0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0851ef0b6bdbd97ad22c13a8bf76727918931095))
* **deps:** update dependency jest to v27.2.3 ([1ddedce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ddedcee0027068088f84745f704ae7a0be0f0fc))
* **deps:** update dependency jest to v27.2.5 ([caacfd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caacfd324dcaac6ed6118546995601627b5ae2d3))
* **deps:** update dependency jest to v27.3.1 ([c3ccbfe](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c3ccbfee9e108808886e497802309722bf4f1b2c))
* **deps:** update dependency jest to v27.4.4 ([45e4936](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45e49369607c410e33842511dc9b2c3f38efa4d7))
* **deps:** update dependency jest to v27.4.7 ([30a6aac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/30a6aacfe7c046e4248f1f443d6e7e875d3af40e))
* **deps:** update dependency snyk to v1.720.0 ([5bb5d4b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5bb5d4bd6a0007271f7eab419b851d8346dd1bca))
* **deps:** update dependency snyk to v1.722.0 ([c488b84](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c488b84f73c6ec9e521577f2c394de607089083a))
* **deps:** update dependency snyk to v1.723.0 ([cadfd18](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cadfd18794c7eed1fa364b0820e48e7e3fb1adae))
* **deps:** update dependency snyk to v1.725.0 ([6952419](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/69524195971262c9265c4daa943604a5b4c8af31))
* **deps:** update dependency snyk to v1.726.0 ([a3f1142](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a3f1142f2fec89d933815316af117b0482bd8d75))
* **deps:** update dependency snyk to v1.727.0 ([3a4b61b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3a4b61b711a2859a40ed79f8a8f8ce21cf2eedf2))
* **deps:** update dependency snyk to v1.730.0 ([eb43937](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eb439372aebce349d9cea0dc610e080e69607391))
* **deps:** update dependency snyk to v1.731.0 ([e95c905](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e95c905090c4a3fd0f864c09272406f4c966365f))
* **deps:** update dependency snyk to v1.733.0 ([7d9f644](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7d9f644c3cf8c29e8dbf71f5410b01052e43081a))
* **deps:** update dependency snyk to v1.736.0 ([dc770c2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dc770c2cf2c95c72c79c66690eaac75ab1df2eb7))
* **deps:** update dependency snyk to v1.741.0 ([2c23796](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c23796edfbba9a5a390d6c6ced7569145489b6f))
* **deps:** update dependency snyk to v1.742.0 ([4bc3649](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4bc3649e4fc50b8a81e93ae5faeb5b51cc4e6932))
* **deps:** update dependency snyk to v1.788.0 ([285815c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/285815c7e6643b2ca522c86f1e79b31e1b25d1be))
* **deps:** update dependency snyk to v1.826.0 ([3fb8a40](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3fb8a40ffe43a0265c8cd9e8dc3e5ac550f8b83d))
* **deps:** update dependency snyk to v1.840.0 ([75d51e0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/75d51e0b3488bd411880097b5c3729789e743a6d))
* **deps:** update googlecloudplatform/release-please-action action to v2.32.0 ([2f36a5e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2f36a5e304fb963c79cf09aa133f71bb2184a89a))
* **deps:** Updated dependencies ([90293fd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/90293fd5118d25a8bd91d6acf80ecdd63d837411))
* **deps:** Updated dependencies ([ee87838](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ee878386f6c29c4c62b7c453b72af001db990830))
* **deps:** Updated dependencies ([452cb64](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/452cb643f47da8124f5fbad44378bf7f0017735b))
* **main:** release butler-sheet-icons 1.2.0 ([e013279](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e0132797207eec93d6faae4075ec27dd001fe3df))
* **main:** release butler-sheet-icons 1.2.1 ([450fb82](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/450fb826422d4d5fb3012b191b80c05d19822b81))
* **main:** release butler-sheet-icons 1.3.0 ([6b8eb29](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6b8eb29361ebf73e50e8b0cb3955e61fbcd4b0d3))
* Move to 2.0 alpha release ([a4d0c6b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4d0c6b8576261666e3be5760c63e49ba3746e93))
* release 1.0.0 ([#2](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/2)) ([4d9299a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4d9299a24563fb514e9f08caddf863f8b6abff45))
* release 1.0.1 ([#3](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/3)) ([1b26d76](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b26d7656304a28ab4fc4967919a9c562a7425b9))
* release 1.0.2 ([#4](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/4)) ([b737f99](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b737f993640ba106cfbf8ace84c8b150090ffb88))
* release 1.0.3 ([#12](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/12)) ([11029d2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/11029d24afd0cf19cb48552a40d56cf668a24368))
* release 1.0.4 ([4f5fce4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4f5fce487643d7089f36d90e1cdbcfeae6a9e9bf))
* release main ([caf14e6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caf14e610c92bc727e3fb04faa0fa3b67d0232d2))
* release main ([d513926](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d5139261d79ef9a3406676a163ab7b43e3b99675))
* release main ([cd8d1bf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cd8d1bf9f2c614162328c1d57e4cd0a9c9c71e75))
* release main ([df94cdf](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/df94cdfa8ef38d04e9758f42c8790d6e12319f5c))
* release main ([d190f2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d190f2b37b327a6551f58424f4e853fc98fb88e6))
* release main ([80eb039](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80eb03952fb5a7d047ab47fc5c0e6e71d282cc58))
* release main ([80b64cd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80b64cd876f8973756d0f1f30d1e4014e50f1307))
* release main ([f1a13f2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1a13f222489548018b86c49b02582c97c8baa6c))
* release main ([aad25dc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/aad25dc2b82c9a929d044c3f0ad880f916a2214d))
* release main ([6200233](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/62002332a4a12086cbebb8b489cb0f76034cdd9d))
* release main ([67b5b1f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/67b5b1f474b48c302b4669d392ef26dbb8a7522a))
* release main ([2c3580e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2c3580ef9736e462e065b8eae401784ddb86852e))
* release main ([8426ca3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8426ca35d876d4f0a8b57c03794868269664134f))
* release main ([eeca002](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eeca002f1cd3e59f65cf29cdb33b0dd76b450050))
* release main ([d404b8d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d404b8d09b8b78a1ca0e3630e0bcedb5db50c7bf))
* release main ([5fd9fd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5fd9fd3fb442842023f232b9fc7b3885b60a2bde))
* release main ([#61](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/61)) ([a5cb515](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a5cb51533e7a7c211a750cdb21c45073a0c3b898))
* release main ([#64](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/64)) ([9734406](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/97344065897efa1e30c09931dacf5208f516b4cd))
* release main ([#65](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/65)) ([99b0fc2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/99b0fc223d5eec8f54529ed03a1ecdb6a87cdd80))
* release main ([#66](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/66)) ([0b9b735](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0b9b73549bef0a235f4f062e9aaafe315263bd84))
* release main ([#67](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/67)) ([bd20362](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd2036223f108507bf36c3ccc4fa5bc1bbac3156))
* release main ([#69](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/69)) ([2d60408](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d6040854119b1e3923a69acfb07c45757afe7fe))
* release main ([#73](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/73)) ([e44765c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e44765cfb73bff9b87de1fb825a9e46b534ce76e))
* Update dependencies ([1ef8785](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1ef878592a333df1b4312db44872cef01e888e40))
* Update dependencies ([13f0c67](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/13f0c679b9afb4ad48150f29bb0512a9b18e6dcb))
* Update deps ([c7ea713](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7ea71370f135c298e137160672e1b5140cf5aa5))
* Update deps, fix spelling typo ([189302b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/189302bf09661ab7e92bf9339f1af8c2e26c901e))
* Use latest & greatest foundation for created Docker images ([1655ba3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1655ba3d233ae9d8aeb41bfbc1915e7103bc52ca))

## [1.3.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.2.1...butler-sheet-icons-v1.3.0) (2022-01-30)


### Features

* Update multiple apps using Sense tags ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113)


### Bug Fixes

* Only upload images from the processed app to content library ([3e01242](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3e0124277ef81a22f8418331796964628633e1c9)), closes [#114](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/114)


### Documentation

* Update docs for 1.3.0 ([2d98cde](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2d98cde81b9473de2efc7e60ef4425b41c83bafa))

### [1.2.1](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.2.0...butler-sheet-icons-v1.2.1) (2022-01-29)


### Bug Fixes

* **ci:** CI tests handle --includesheetpart flag ([55ba659](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/55ba659b987a4b0a08bfcec111ddb398b4ab7030)), closes [#107](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/107)
* Correct thumbnails when using virtual proxies ([dadc6e7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dadc6e792c35ad39aa0fe6e8a56b56542e1c79f2))
* **deps:** update dependency commander to v9 ([8c67249](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8c67249b0c5d7cba0b0f1d21dc03b8e3345b2c51))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([cb3c439](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cb3c4398c944947968d48030eea0cf5c192cc2fe))
* src/package.json & src/package-lock.json to reduce vulnerabilities ([c48e629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c48e629178f76470b33c830f1df9c89a87568641))


### Miscellaneous

* **deps:** update dependency snyk to v1.840.0 ([75d51e0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/75d51e0b3488bd411880097b5c3729789e743a6d))

## [1.2.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.10...butler-sheet-icons-v1.2.0) (2022-01-17)


### Features

* Control part of sheet used as thumbnail ([5da0929](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5da092973ef2a5d823b9cc9ce863eb6c3ea9d468)), closes [#6](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/6)
* Refine automated CI testing ([2259815](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/225981594cf8fa82bacabc741c64ad169269e72e)), closes [#7](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/7)


### Miscellaneous

* **deps:** update dependency jest to v27.4.7 ([30a6aac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/30a6aacfe7c046e4248f1f443d6e7e875d3af40e))
* Update dependencies ([13f0c67](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/13f0c679b9afb4ad48150f29bb0512a9b18e6dcb))

### [1.1.10](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.9...butler-sheet-icons-v1.1.10) (2021-12-10)


### Bug Fixes

* **deps:** update dependency puppeteer to v13 ([5e1b8c5](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/5e1b8c51a2f361a588aacacb3b136948ee355d2d))


### Miscellaneous

* **deps:** update dependency jest to v27.4.4 ([45e4936](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/45e49369607c410e33842511dc9b2c3f38efa4d7))
* **deps:** update dependency snyk to v1.788.0 ([285815c](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/285815c7e6643b2ca522c86f1e79b31e1b25d1be))

### [1.1.9](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.8...butler-sheet-icons-v1.1.9) (2021-12-01)


### Miscellaneous

* **deps:** pin dependencies ([687dd42](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/687dd42d0e4c32ba2111152ff5f669a7d82bf504))
* **deps:** Update dependencies ([656f62e](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/656f62eee3e09646c115eb01163ca0afb4be4854))

### [1.1.8](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.7...butler-sheet-icons-v1.1.8) (2021-10-21)


### Miscellaneous

* **deps:** update dependency jest to v27.2.5 ([caacfd3](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/caacfd324dcaac6ed6118546995601627b5ae2d3))
* **deps:** update dependency jest to v27.3.1 ([c3ccbfe](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/c3ccbfee9e108808886e497802309722bf4f1b2c))
* **deps:** update dependency snyk to v1.741.0 ([2c23796](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/2c23796edfbba9a5a390d6c6ced7569145489b6f))
* **deps:** update dependency snyk to v1.742.0 ([4bc3649](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/4bc3649e4fc50b8a81e93ae5faeb5b51cc4e6932))

### [1.1.7](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.6...butler-sheet-icons-v1.1.7) (2021-10-13)


### Documentation

* Update src readme ([b058b5f](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/b058b5f78797e87f5b307531dde1554238a39051))

### [1.1.6](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.5...butler-sheet-icons-v1.1.6) (2021-10-07)


### Miscellaneous

* **deps:** update dependency snyk to v1.733.0 ([7d9f644](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/7d9f644c3cf8c29e8dbf71f5410b01052e43081a))

### [1.1.5](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.4...butler-sheet-icons-v1.1.5) (2021-10-05)


### Bug Fixes

* Tweaking Docker builds ([#63](https://www.github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([577deca](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/577deca2deea1b9ea69c0e416cdd1c5803a0d929))

### [1.1.4](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.3...butler-sheet-icons-v1.1.4) (2021-10-05)


### Bug Fixes

* Twaeking Docker builds ([#63](https://www.github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([cc860c9](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/cc860c9ae20cef15f7251c98510f6d2797c181de))

### [1.1.3](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.2...butler-sheet-icons-v1.1.3) (2021-10-05)


### Bug Fixes

* Tweaking Docker builds ([18b43d0](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/18b43d0b42c4220f521e7a1b7ae3fa2f5f863403))

### [1.1.2](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.1...butler-sheet-icons-v1.1.2) (2021-10-05)


### Bug Fixes

* Fix failing Docker builds ([#63](https://www.github.com/ptarmiganlabs/butler-sheet-icons/issues/63)) ([44e8e99](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/44e8e99409a808b9d15d8aecb4979c899b8bd904))


### Miscellaneous

* **deps:** update dependency snyk to v1.731.0 ([e95c905](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/e95c905090c4a3fd0f864c09272406f4c966365f))

### [1.1.1](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.1.0...butler-sheet-icons-v1.1.1) (2021-10-04)


### Miscellaneous

* **deps:** update dependency snyk to v1.730.0 ([eb43937](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/eb439372aebce349d9cea0dc610e080e69607391))
* Use latest & greatest foundation for created Docker images ([1655ba3](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/1655ba3d233ae9d8aeb41bfbc1915e7103bc52ca))

## [1.1.0](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.15...butler-sheet-icons-v1.1.0) (2021-09-29)


### Features

* Make cert validation optional ([ab3e331](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/ab3e3315497b04c1103e28b170b3c90ee29d5ada))


### Bug Fixes

* Update dependencies ([2174796](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/217479629841b3dbfa23ccc9d0449134c536342e))

### [1.0.15](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.14...butler-sheet-icons-v1.0.15) (2021-09-29)


### Documentation

* . ([56c5f55](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/56c5f55582336f8e4940ebf3d3686638a959744a))

### [1.0.14](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.13...butler-sheet-icons-v1.0.14) (2021-09-29)


### Documentation

* . ([61b385c](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/61b385c9df508582c7c0d22f2bc9b41fae352cdf))

### [1.0.13](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.12...butler-sheet-icons-v1.0.13) (2021-09-29)


### Documentation

* . ([4b7616f](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/4b7616f03e2ca35830772ed6d1cb329182e7b1c1))

### [1.0.12](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.11...butler-sheet-icons-v1.0.12) (2021-09-29)


### Documentation

* . ([78849b9](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/78849b97f8e95cb4077525568da6368c40b590c9))

### [1.0.11](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.10...butler-sheet-icons-v1.0.11) (2021-09-29)


### Documentation

* . ([2eb8251](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/2eb8251207ff0acfc8914e584dcfcda4a8b0d81d))

### [1.0.10](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.9...butler-sheet-icons-v1.0.10) (2021-09-29)


### Documentation

* . ([6cb7a8a](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/6cb7a8a4dc038be0408ca7233901544625e63836))

### [1.0.9](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.8...butler-sheet-icons-v1.0.9) (2021-09-29)


### Documentation

* . ([63733eb](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/63733eb3759c91805fe83fb97ade805e2b70d2de))

### [1.0.8](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.7...butler-sheet-icons-v1.0.8) (2021-09-29)


### Documentation

* . ([60ba008](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/60ba00849a47b73864ff36b8275b25fd19b7cff8))

### [1.0.7](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.6...butler-sheet-icons-v1.0.7) (2021-09-29)


### Documentation

* wip ([6a25789](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/6a25789164bf57301e1aeca04002e0aa0bfb5d4e))

### [1.0.6](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.5...butler-sheet-icons-v1.0.6) (2021-09-29)


### Documentation

* Docker build debugging ([925c2c6](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/925c2c630cd5349170b05e86803de84a429d6095))

### [1.0.5](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v1.0.4...butler-sheet-icons-v1.0.5) (2021-09-29)


### Documentation

* release process wip ([87b90ad](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/87b90ad6b291b291fb323e02bfdcdc3a7daf5cb7))

### 1.0.4 (2021-09-29)


### Documentation

* release process wip ([a222293](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/a22229325b321ee48042ce5eccb2bc86180f899e))

### [1.0.4](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.0.3...v1.0.4) (2021-09-29)


### Bug Fixes

* Add README file ([d40d429](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/d40d429fcca5a5784271e91df540836220331255))

### [1.0.3](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.0.2...v1.0.3) (2021-08-31)


### Bug Fixes

* Updated dependencies ([db95b23](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/db95b2326f7d2ffb54dd62bff5306edad4029da7))

### [1.0.2](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.0.1...v1.0.2) (2021-06-28)


### Bug Fixes

* add comments ([de5b041](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/de5b04171c50fa83db940461700373acb0c80c8b))

### [1.0.1](https://www.github.com/ptarmiganlabs/butler-sheet-icons/compare/v1.0.0...v1.0.1) (2021-06-28)


### Bug Fixes

* improved info texts in app ([1934e0c](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/1934e0ccae7789539debe65eee044587150b7229))

## 1.0.0 (2021-06-28)


### Bug Fixes

* app name in package.json ([ff35688](https://www.github.com/ptarmiganlabs/butler-sheet-icons/commit/ff356888ed513ff482dc41875bafffd0d2522de7))
