# Changelog

## [5.0.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v4.1.0...butler-sheet-icons-v5.0.0) (2026-08-20)


### ⚠ BREAKING CHANGES

* the app overview screenshot is renamed from overview-1.png to overview-before.png. Anything reading it by name needs updating. With two overview screenshots per run, a positional name no longer says which state the picture shows.
* `--browser firefox` is no longer accepted by `browser install`, `browser uninstall` or `browser list-available`. Commander validates environment values against an option's choices, so BSI_BROWSER_I_BROWSER=firefox, BSI_BROWSER_UI_BROWSER=firefox and BSI_BROWSER_LA_BROWSER=firefox now fail at argument parsing rather than later. The Firefox release channels `nightly`, `devedition` and `esr`, and channel-prefixed build ids such as `stable_153.0.3`, are no longer valid `--browser-version` values. A Firefox left in the browser cache by an earlier release is removed by `browser uninstall-all`.

### Features

* --dry-run shows what a run would change without changing it ([#993](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/993), [#1072](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1072)) ([81f8f64](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/81f8f648f514d53994005d2cac0bf1e55759a337))
* add a browser check command ([d1e5956](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d1e595627d5f298ef01f5dc572f9a418257b9707))
* add a doctor check command ([fcc1bf8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fcc1bf8b55525b56b8984189f59498ab451bdc43)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* add the contact-sheet glyphs to the symbol sets ([2693f2b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2693f2bd3dece45f6bdf825de98e00f23ef7aaa8))
* ask again about the options that describe this run ([1b75d89](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b75d8957c8e7a47df0a99c1ed325b0ee4cc2c76))
* BSI_LOG_TIMESTAMPS can drop the timestamp prefix from console output ([#1002](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1002)) ([2107be6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2107be6d802be0381531d9e9fd5719fc3641b751))
* capture the app overview before and after a thumbnail run ([af39290](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/af39290cfbf8def80cd3cd43a392c665e633bb59)), closes [#735](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/735)
* check a supplied answer before the first question when it can be ([ac50728](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ac50728817714e04509df00263357d0bcb6a2469))
* check the answers a .env file supplies ([5788545](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/57885459d223045c549e4b00a905d74872d0df71))
* choose the browser cache directory with --browser-cache-dir ([6c67cef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6c67cef1c42d7cdae2b53c774167cd19fe15d10e)), closes [#1024](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1024)
* **cli:** accept several apps in one run ([f9653a8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f9653a8ec8236dc05332d180bef8059e50eb4885)), closes [#895](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/895)
* fold the App version line into the run-card header ([1fc8ad2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1fc8ad2df929252696b15ea967ffad6810f003ae))
* generate the doc site's CLI option tables from the command definitions ([83256ae](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/83256aee6a434e7deabb1f4b41a34043f509399f))
* **interactive:** add the review table, .env saving and a run verdict ([53addf7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/53addf77ff660f9b141b172833bed88c460e4e92)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* **interactive:** reach the wizards with -i on the command itself ([d4f0db3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d4f0db3d6605d2d0d5cc6246702ce747740bb9a7)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897) [#886](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/886)
* **interactive:** update .env in place instead of replacing it ([17e27a6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/17e27a689abc9367d2872254e1a9440af7140719)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* let a variant build contribute commands and options ([0557e2e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0557e2e88cbf16b5036304f44c75da28ac2c37e5))
* name the underlying cause in error messages ([fe3b73c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fe3b73c575c3b3bc38b80c589536bce02c336048))
* point Butler Sheet Icons at a browser with --browser-executable-path ([d758846](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d758846c977de7f8558436bdaf6dd0b5389430c6))
* **qscloud:** add listCollections and listApps helpers ([e8968d9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e8968d9bae99eefe45d31bac6e328d46823b45ba)), closes [#960](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/960)
* **qscloud:** add the create-sheet-thumbnails wizard ([e974267](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e974267a065d048ee9e24a39f533f4c12b49705e)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* **qseow:** add remove-sheet-icons command with dry run and run report ([74c9d44](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/74c9d444ed260829e9ed4260560eabe53e55ce9e)), closes [#894](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/894)
* **qseow:** add the create-sheet-thumbnails wizard ([e5e2dce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e5e2dcee82abaaae1d0b48a82d5d72575e7d9517)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* remove Firefox from the browser commands ([704d479](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/704d479d0dbc62e41748a6a4964f4e8522cb96d0))
* render a run card on every thumbnail run ([e8228f6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e8228f69c1d57ab5e39c92c105e330edc8ccdba1))
* render the contact-sheet board and wire it into the run flow ([2672113](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/26721135f166c39bb2468b34f276e77bbac9c999))
* render the live run view and wire both create-thumbnails twins ([57c6569](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/57c65693add7b6dd3b6093f972428a32863ef33f)), closes [#1075](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1075)
* restore the live-view terminal on crash and on command completion ([7083157](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7083157425f8c8e203f1a1c1c2b20041b49f6979))
* select the run-output rung from the terminal and BSI_OUTPUT ([3d70077](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3d70077f65073fbb8e407b45685adc6c6f290aa4))
* shut down cleanly on SIGINT, SIGTERM and SIGHUP ([6790fa0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6790fa007b5365c899f93c4f21aa2c48b76502d2))
* stop the platform workers cleanly when a run is interrupted ([bfc1fee](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bfc1fee8ce40c39134120396e367275ae7c5a7aa))
* suppress the browser download bar while the live view owns the cursor ([9270924](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/92709245efe151b196490c81f2f27e9f542992ea))
* tell a pre-action hook which options the operator supplied ([01c92eb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/01c92eb2330c1d988a8de4f28c952aeb019d55f9))
* warn when a thumbnail was captured while the sheet was still loading ([45ba8d6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45ba8d63615fabe0796e221e9b415ff6d9200366)), closes [#1119](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1119)


### Bug Fixes

* accept a virtual proxy prefix written with slashes ([eb6ed25](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eb6ed2554b3f21d13688159d184b1fe67f84b20f))
* announce a skipped Cloud login once per app, not once per session ([86a1e7f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/86a1e7f5faa59060d16fd7d81e8969f5b47f7bf7))
* apply --qrsport, which the QRS config key misspelling ignored ([f6396c6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f6396c660bc86ca31057d13ee53cc9e07d943dbe)), closes [#1050](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1050)
* arrange the Cloud round-trip test out of icons without media ([75c98d7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/75c98d7ec7bd8c5345e9e74546c5f85260db9619))
* ask about app selection that .env already supplied ([77d90ef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/77d90ef5b53477e785286809d2337f9188c459d7))
* build releases from the tag that was released, not the triggering commit ([fa9c953](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fa9c953420f77b01f8f336fd51cfe4af663dcd8a))
* bump puppeteer-core so current Chrome builds can be driven ([96f210e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/96f210e31b1472676f3ebcdbca2ef2407e3602e8))
* clone a repeated reference instead of mistaking it for a cycle ([405e245](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/405e24531a941d29d998332d7a65c27392586fcc))
* compare resolved paths in the system-browser test, not POSIX literals ([48f4ce8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/48f4ce899b032db0ffc69a9fc27cbcc9c175cc0e))
* correct the option help text on browser list-available ([3ad667c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3ad667c63a9259fe7a4d79d929dcc3c550558863))
* count the dry-run summary the way the run's verdict does ([ec1d609](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ec1d609f02e766927fa349e800d44ba16c4b2944)), closes [#1115](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1115)
* decide insider signing by using the key, not by reading the store ([7da80a3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7da80a31051afdaacaf1b1cf5366ea8453669aef))
* describe a removal plan from what the platform actually writes ([c4146d9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c4146d9b2e9140da85337b64c32e70b14f8db8cc))
* drop to the plain rung at any log level other than info ([c3de655](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c3de65592a413f6a85cda800c664b71aff4d3f88))
* emit the run header from the workers and decide the rung once ([be5f58f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/be5f58f25ad66130236a965c1e05feb6d808ee82))
* escape the backslash in generated table cells before anything else ([1512b7c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1512b7cbd3a8a5d14fb76c5722dae00bedcb3aa7))
* harden the board's width model, strip placement and legend edges ([748f218](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/748f21877e9286a794000b884b641104730b2dc6))
* **interactive:** close three more holes in the .env merge ([e676990](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e676990dc1b2c4a0415a2d691fabee0777bc8579)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* **interactive:** decline browser uninstall -i when nothing is installed ([e527ae4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e527ae47a2127db47b3a19dee99d24ef15f34077))
* **interactive:** stop a saved .env quietly corrupting what it saved ([747ff10](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/747ff109dfbaadca2bed1c9108175f4b641a1c07)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* **interactive:** stop the .env merge losing or duplicating settings ([add55b3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/add55b38ef544f74e0c0f1b499e1b36540ad0baf)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* **interactive:** stop the banner claiming a replaced option was skipped ([40ee32b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/40ee32ba43da7295f6ea28bd6ea9d8b6db8c8edf))
* **interactive:** stop two new tests depending on the host that runs them ([1a73b3e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1a73b3e6ba751ee48f28fd8533e68d449c622416)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* isolate fact gathering the way the runner isolates checks ([5adf12a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5adf12a33066dacad3fd3a09c0578ede06c99e6d)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* keep the doctor JSON document off the same stream as the log ([376214d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/376214dc5b905689c5cbcfabdf03aa0e09164d40)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* label a cached build by whether this machine can run it ([46b7c08](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/46b7c084a162fa6876025bb5392133f47eb44b90))
* let a sheet status be ticked in interactive mode ([ccc79c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ccc79c5931d9144b92e29be5a0655ca5341d7047))
* let browser install succeed offline when the build is already staged ([208d66d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/208d66de5e8c4c20d23fdabc8dbee903af083f8a))
* log out of Qlik Sense even when a run fails partway through ([128ec48](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/128ec48c654242b02d8f63bf4b76ca29560d8e1d))
* match the wording signtool actually uses for an unusable certificate ([4f7d3ce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4f7d3ceede490117f49f07cb355c3762cb3ec543))
* never report OK for an area doctor check did not examine ([a3340be](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a3340be2ae648efa5c450935f1e7b69b35d8bb81)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* offer one uninstall row per build id, naming the build that will go ([d529d29](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d529d2903eef5e0fcb5c1e70136f928168ac2ebf))
* point doctor --help at the options isDefault hides ([3443c4e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3443c4e428423971de9923bb18d3c498b6614bcc)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* prefer a build this machine can run when none matches exactly ([322f81c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/322f81c47605952412555d394844ff6f576a3d2d))
* **qseow:** harden logout across Sense releases ([a155b73](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a155b73333797b27411812e776454218d09c781b))
* recognise a lost engine session by enigma's error code, not its wording ([27760b5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/27760b58c8fabcb0fcf9d7623a169edd90537862))
* recognise an optional true/false option in the wizard ([c38e191](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c38e191e89964ba2a3713b07b53085b4a698a0e1))
* redact quoted secret values ([c25b5a6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c25b5a6eff7d1607da8352b1844d32a23564b93f))
* redact secrets given as a command-line flag ([ae70a30](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ae70a3045c31e17708699b7635c47bf713d33511))
* remediation suggests re-running the command that was actually run ([93104ef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/93104effc75217389292a4cdcfde3f691c55a707)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* remove the command-line secret redaction rule ([6092820](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6092820e8b6dc45113ff387a9e64c08f68338e1a))
* remove the duplicate timeout-minutes that broke insiders-build ([268733d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/268733d6f42e206017a227a0fb576a767ff90e89))
* repair only the apps missing media, not the whole selection ([74b3a68](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/74b3a68536b726aff3592f92783c668db4e428d3))
* report a browser launch that stalls outside the launch timeout ([e6fe4f9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e6fe4f98106a89cf9a98ba66927f7c161c025c01))
* require the threaded rung, and make the removal name read best-effort ([21b25f1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/21b25f171648a3c02edc55db52d458dcbdb7e400))
* say when a check was skipped for want of network access ([8f6d986](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8f6d9868a142fb0c8ff70712a6c9beb90425e579)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* sign Windows binaries again, with the new Certum certificate ([10c7e17](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/10c7e17edd8243928e7e7b542c8cca6da991a211))
* stop --dry-run promising rules a command does not declare ([a1b71cd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a1b71cd6dc24b26cd755a988fa4d328eb76c9d67))
* stop a non-list data field throwing from inside the request helper ([f954ba7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f954ba7bff7a1b327b759a29e0f5341e48af0cdf)), closes [#935](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/935)
* stop a second removal rewriting sheets it has already cleared ([c8421b3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c8421b37f54509140fca140675985ffc3e4654d7)), closes [#1113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1113)
* stop an unreadable Qlik Sense Cloud reply throwing a TypeError ([0a14b23](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0a14b23831e7c919196ed83e17fa65b2a748c45a)), closes [#935](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/935)
* stop detection accepting cached browsers this machine cannot run ([6619d12](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6619d1231282a6aa1c9c715f45129d0515ce69d7))
* stop offering a pre-fill a masked prompt cannot show ([00f324c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/00f324cb841f5b2d82a5379c0fcea845372067ac))
* stop printing stack traces at the default log level ([c8c9dc6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c8c9dc6694e09024c0e159b703d7c8a61d108037)), closes [#906](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/906)
* stop reporting our own engine session close as a dropped connection ([86a60e5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/86a60e5bb8a1329deb1f7b5d28e77851d431e470))
* stop the generated option tables reporting defaulted options as required ([e9f1674](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e9f16746690186a4a358d09f4d768cee90152dfd))
* stop the slow-launch report misreading an ordinary timeout ([48164ed](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/48164ed0120cfc107af7e9ee74dfdcc8f5b172d5))
* stop unit tests reading the developer's .env ([bafb3e5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bafb3e5fd41e56d821369cc12d040a10053ca089)), closes [#1014](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1014)
* stop unit tests reading the developer's .env ([#1014](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1014)) ([5add655](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5add655c600833cf031c8b4d04df2fe1b54ab754))
* **test:** assert missing streams with null, not undefined ([ae8f050](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ae8f050d37195535ffd547335824295328c9b0d3))
* treat a closed output pipe as an ordinary end of run ([e1523d4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e1523d48636c6087f1eaa20f90093ecd8cb2bc03)), closes [#1019](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1019)
* treat a socket losing its reader as a closed pipe, not a crash ([7a747d5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7a747d539fe8dd735b9a355934d4bdd0fe6d6497))
* true up the contact-sheet strip, widths and verdict facts ([9f9bd5d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9f9bd5db302e0e0d78f5d4c051bc7cb368106615))
* true up the live view edge cases found in review ([6116625](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6116625027112c3d3d9d1c6f4480b12c3cdf0ee7)), closes [#1110](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1110)


### Miscellaneous

* add a shared Windows signing library and diagnostics ([f43a188](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f43a18862ac69c3278ea8df9b06b792d25c5ccc4))
* add a short pull request template ([ea9f203](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ea9f2031b71c891b853fb4660e0fb48e33428cde))
* add a Windows signing canary workflow ([0525aa7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0525aa74645a5452eecc7138b4c8db1e9d5f49d0))
* add the demo recording pipeline ([d06ec81](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d06ec81f9c3ad530de285ee821baaa9b3850b7cb))
* brand the demo recordings as Ptarmigan Labs ([bd806a3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd806a383ba9ec4216f44cb498117e0380b5e6ee))
* bump pinned GitNexus to 1.6.9 ([e4073a0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e4073a02843b01d11f7917e369aba12bf37b3a8b))
* canary the extensions override on Windows and Linux ([a2a6fc6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a2a6fc6e90a53c1c6a05ec12467dde821102e4be))
* check the Windows signing library on every pull request ([2ca48f9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2ca48f995e6e919e9a33753705853dbaf18db338))
* collapse the demo pipeline's two real runs into one ([152c592](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/152c5927320e1a274b7583ce111ed17007e16916))
* enforce the extension point's boundary in lint and at commit time ([8b662bd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8b662bdc46183c75a636895e103703e41ae14f2f))
* give the browser integration tests their own browser cache ([26320f0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/26320f092a98dca31cb66435952a62df97d07d83))
* make the signing canary run the release job's exact preflight ([8096564](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/80965641498a3944e73a94458bbf55bdb0dd58bb))
* pin the demo sheet part so an ambient .env cannot change recordings ([00c7b3b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/00c7b3ba65d906238cda017eafb6a43dec5bac22))
* print integration-suite logs plainly instead of jest-framed ([eace958](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eace958992a124ea63c2ebe954f668bd533bbeb0))
* re-record the demo casts against the current CLI ([a4ae018](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4ae0185baf762e2414680bb85e481d3d4a9f8b0))
* refresh the generated skill files ([2cb973e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2cb973e65e28344e273d5a8107f05f8b9b0029cc))
* refresh the gitnexus index ([c4698fa](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c4698fa397a2ea7d36c32a47f5f68273ba7a0dd8))
* refresh the gitnexus index ([c2c9f42](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c2c9f42069b9e0cad73ad161d127ad13ce62b354))
* refresh the removal dry-run snapshot ([c7300f6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7300f6e046fbc0a539439c925734bb06645655c))
* regenerate GitNexus skill files for 1.6.9 ([3007d55](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3007d55f975f300e0533f03a5d118088fa99ca97))
* render the demo videos landscape ([485ae1c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/485ae1c34583c688c5373d7d2e5b419ad27b333a))
* split app ids in the integration tests the way the CLI does ([29fb61c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/29fb61c80cc98ca082206dec7cdc26238f7a2b8d)), closes [#910](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/910) [#895](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/895)
* stop --forceExit hiding real test leaks ([119a8c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/119a8c522072c6a9a2159981ed92f7316a289abf)), closes [#951](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/951)
* stop failure-path tests poisoning Jest's exit code ([e9c1ef8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e9c1ef8e46c4884ad3962e429ba3b0ddbd8c6c2c)), closes [#951](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/951)
* stop prettier and the skill generator rewriting each other ([0d1f41b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0d1f41b8c08e8ffada39c791572d72ffc5f3f912))
* stop Prettier reformatting the GitNexus-managed markdown ([258d5ce](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/258d5ce39c25865717081ea667c89f4196377ac0))


### Documentation

* archive the browser check draft as published ([f4eee1c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f4eee1c0240c960155442dce39e4d74decb08389))
* archive the browser-executable-path draft as published ([58bd39e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/58bd39e83c8e01a49e5f253f702e89a14afce106))
* archive the cached-browser-checks draft as published ([93f8217](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/93f8217fa34880c5e0b05c0f6870a212f3a05340))
* archive the closed-output-pipe draft as published ([651f91f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/651f91f0a9ec3cd773fb8f8e97205a893bd3c99e))
* archive the contact-sheet draft as published ([8b219cb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8b219cb01252aa45f993f75408a64e711d8aad83))
* archive the doctor and redaction drafts as published ([c011cd0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c011cd024e0874a6b5d6e44f0f6bad0270857610))
* archive the dry-run draft as published ([94b1c43](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/94b1c437a4f532f25cd23db1e7c01ed14ac3ebd9))
* archive the log-timestamps draft as published ([7a41349](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7a413495db672f352a5ce10edb8470781e8bec9b))
* archive the offline-install draft as published ([16bf1f5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/16bf1f510158a1d4af653ff60e293a4cfbef0096))
* archive the renamed-messages draft as published ([ad7ad72](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ad7ad722a343af8cde6d19fe1a6be75dafb67880))
* archive the run-card draft as published ([25d6629](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/25d6629d0cf94c7e2575baa5aba7cedad5833d4e))
* archive the three drafts published in doc-site PR [#112](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/112) ([da2fc97](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/da2fc97b081618e63f89cf561eaaaa0a58633209))
* archive the two drafts published in doc-site PR [#113](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/113) ([05c9ca1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/05c9ca10ca60a6ac81dc08994c712ca7df047703))
* archive the two published drafts ([059ba1b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/059ba1b74c4f0e0cf6284c42a20905d261aad505))
* archive the two republished drafts, and record why a draft can go stale ([7d446f7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7d446f726d14285aba255c0b46ab26f13770c6db))
* archive the Windows signing draft as published ([0a8013d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0a8013d34788e6952ef5bf5ed7573d7ae6e7be6b))
* correct the contact-sheet page and regenerate its sample ([bd73fd4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd73fd4ec22ebfbc602596aa1ebfdd152cff9924))
* correct the file count for --capture-overview-after false ([5913131](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5913131925e13395c793cdebfc603413de2defca))
* correct the phase 1 design doc against what has shipped ([76c120e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/76c120e3da1f41397fd54e86ea876a365f8b6ddc))
* correct the shell the Windows signing runner actually has ([f8642ef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f8642ef71f4817cc08311158b90bee4e2c910eb4))
* describe Chrome as the only browser, and stage the doc site update ([9c12b7e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9c12b7e341b4c62d57c73057bf69717eb0b063c3))
* describe how the wizard chooses apps ([1b1ad65](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b1ad6550092e0c723e9374e7deb9600581bfda9))
* describe interrupting a run ([6d14973](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6d1497301be12ae2d0d1013a6bced9378023b529))
* describe naming several apps in one run ([c8780c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c8780c5fdf71da0dbc304846d99991e1e3a25e7a)), closes [#895](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/895)
* describe the -i flag and pre-filled options ([380c038](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/380c0381fcb28f3aa5151bfef13eae3022615aff)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* describe the before/after app overview screenshots ([467f69c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/467f69c0ca624f2121cdda02b4019e76da1c346f))
* describe the doctor command ([48d0bc7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/48d0bc73e6326b9f6e4cacdc02be6162ef0e4ddc)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* describe the interactive thumbnail wizards ([035fb68](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/035fb6881050a7226c49103be87efa3cbe45830b)), closes [#897](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/897)
* describe the one-at-a-time doc site publishing loop ([2169947](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/216994781be5f2c9cd477c27f49dd8cacf1eb0f4))
* describe the two kinds of options the wizard sees ([c4c60b5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c4c60b5625015acf15b4ff65db28b4a38199ce04))
* explain a browser that is slow to start ([fdd18c3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fdd18c32450e7380f103a81635db1ae3d0df12a9))
* explain the browser build that stops responding immediately ([8235fb0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8235fb046fd56a6829af070bf225e00a34cbfa07))
* explain the Windows-only ERR_INVALID_AUTH_CREDENTIALS failure ([82194d3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/82194d3d183fd26b3f70ac61a12c383152ee74c2))
* let administrators verify the Windows publisher, not just the signature ([2f0430f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2f0430f7e13af511a749cf82df089dbe12af094d))
* mark the -i flag draft as published ([54bb9ad](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/54bb9adf0bf13f2c0e43d2aafa268aecb68035dd))
* mark the broken pipe draft as published ([41ce378](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/41ce378d1b552b08d90f353ec21ff0d7213f7d7b))
* mark the browser cache directory draft as published ([21de616](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/21de616939ba678875a54a9f00da8e8f022309ee))
* mark the empty-cache uninstall draft as published ([58a19b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/58a19b9f7a6002a24f16489aa505f6f736c0be86))
* mark the Firefox removal draft as published ([3adf411](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3adf4113ad1c8d4b4674ab816aa8550112222e53))
* mark the lost connection draft as published ([ef14800](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ef148006a678c78725bf9a80c9907efb7e0d92c4))
* mark the phase 1 call-site table as history, and correct the gate ([1732af6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1732af64bdcdcfeb10335a8ae4fbe5caef2bbc84))
* mark the QSEoW 2026-May draft as published ([8115082](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8115082e6a1ac4827bac766c3789c8a4a4e1051f))
* mark the several-apps draft as published ([44f7054](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44f7054d1af024d62307f3556187398400127ded))
* mark the slow browser start draft as published ([79b0695](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/79b0695f80faab599bb2de462b639aee43cd44d4))
* mark the unreadable Cloud replies draft as published ([7db1b88](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7db1b88922f5ac5a06174c2e40d4d4359d674028))
* mark the Windows auth credentials draft as published ([c368dfb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c368dfb6595e07975f41741bf94b8c616dc1a6e4))
* mark the wizard review and .env saving draft as published ([cd72cbd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cd72cbdc5f9364cccbbd8d9d55d99b1db2310aab))
* pin the Windows auth draft's version notes to 4.2.0 ([c00ea29](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c00ea29ba1a9ddfb46a66f247f01217b77c29571))
* point the wizard's check comments at the right issue ([7c119ff](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7c119ff5d720769841fbc5ab0d264f52699826f7))
* put the option table generator into the publishing steps ([affc358](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/affc358b28b9b6cf2ada4fd8bfc22eb17cf643f8))
* record how GitNexus behaves in a linked worktree ([56aa11f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/56aa11f92e9fa5fa004ab256b323f098a808104a))
* record the restored Windows signature and the SimplySign session ([c7b473b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7b473bed11da16738671b7b561755a80d981161))
* record two renamed log messages for the pages that quote them ([cf367ef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cf367efa5923e0dfd211cbb2d9a71d05c6f0a7d6))
* remove obsolete legacy README ([d41c1f6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d41c1f6546efce3d9296bbc196412f7ff4c25cce))
* say that option tables are generated, not written ([8042f46](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8042f4689f1fcd8df661f0fa8c0e62808118cead))
* stage a page on unreadable replies from Qlik Sense Cloud ([e4817c2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e4817c29341a639ba0ae9778fd78dd9dc99baf69)), closes [#935](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/935)
* stage the captured-output case as a follow-up draft ([f1c5e73](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f1c5e73d57edb68aea23736cc8c5837caea8c74f))
* stage the contact-sheet and BSI_OUTPUT doc page ([35e2671](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/35e26714e1362cef9cade658c14a42c33c14cc48))
* stage the doc page for the failed-login check ([06d9a96](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/06d9a968091e4a2f838d65cf82c6024ab952703b)), closes [#1087](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1087)
* stage the doc page for the partial-upload change ([b01e300](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b01e3005c0815d9b760efb8fdc16ea69477a6d6d)), closes [#1091](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1091)
* stage the dry-run summary page, and flag the outdated transcript ([8118764](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8118764472c13c7d3a44dca9bba4031b0f675896))
* stage the live run view doc page ([ef92dd1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ef92dd16090317f4008f64361328b13b5f38d46e))
* stage the loading-screen thumbnail troubleshooting page ([f85aed8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f85aed8773e3fe9ec7b11defd9bb3d465ca7db11))
* stage the page on a connection lost mid-run ([743baff](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/743baff838cfbbe76895b516b96e577053508813))
* stage the parallel-session exhaustion troubleshooting page ([c18ddd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c18ddd3bcba4861dfc11fb6476cbeddf76ed4cd9))
* stage the remove-sheet-icons and demo narrative pages ([6c48749](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6c487490d42b47565d533335f77a09d0f8209e34))
* stage the run-card page and refresh the dry-run draft ([3438b26](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3438b26fa1bd59dc654c00041181ed35f975db73))
* state which doctor check variables are shared, and hold the split by test ([9b96ed5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9b96ed552405a1415a83efcfe84fa08b5cb5e98d)), closes [#1063](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/1063)
* true up the level rule and give the strip table removal meanings ([6d412bc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6d412bc5116e5b8ebb9b2ecff603c7989b01c874))

## [4.1.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v4.0.0...butler-sheet-icons-v4.1.0) (2026-08-10)


### Features

* accept several tags in --blur-sheet-tag on both platforms ([a0cd1c5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a0cd1c5b1fdc1b72a212bcf3315c474bd2aa78b9))
* say that the sheet tag options do nothing on Qlik Sense Cloud ([3595e1f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3595e1f3e4b3ee9c9a27d0a667d0b231f8b8dc71))


### Bug Fixes

* cap how many crash dumps a single run can write ([15f7fc6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/15f7fc69461400cedd0c32985fa7b6aaff5d7be0)), closes [#946](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/946)
* **cli:** validate --includesheetpart at parse time in both backends ([e27b326](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e27b32655f85f0d106dbd528f80b208390eaefd2)), closes [#891](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/891)
* give a working way to read the Chromium credits page ([1c1220c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1c1220c4fa1c347442b78ce133fd6abb910febe8))
* look up the sheets named by --blur-sheet-tag on QSEoW ([c332e13](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c332e13436d276b7bd9f495b5b418b6a383ba2ff))
* make --skip-login take effect ([b461562](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b461562ba9c4968a160200bf8d4c6ccd2f392eb5)), closes [#890](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/890)
* make the crash dump end-to-end test run on Windows ([e54ddeb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e54ddebbfef934bd2f8cbca90ef45869c13ef9b7)), closes [#946](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/946)
* options and error messages that named the wrong thing ([#890](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/890) and the same class) ([f22e498](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/f22e49849c58532a520a961fb41a9e1cc47ea3b4))
* read the three per-app QRS lookups through qrsGetList ([94e0e9d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/94e0e9d53903d8922d29557a34fb639e4d7132fe))
* restore certificate tolerance lost in the Puppeteer v25 upgrade ([8f62efb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8f62efb9ea0b56471d0f501b07460c2b9fd4382d))
* send --port to the QSEoW hub and app URLs ([42f1895](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/42f189577c308fadaafa82a122c50053276d42ef))
* ship Docker image licence notices, and restore certificate tolerance lost in the Puppeteer v25 upgrade ([fbab43b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fbab43b303294d05556da8d7faf921fa12edb3f0))
* ship the licence notices for the software bundled in the Docker image ([5caaaaa](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5caaaaa231947e89995a9cde49098156cf3635ed))
* ship the Windows release unsigned rather than not at all ([3f00ea4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3f00ea4f5885654bb0f0f6c0dbb072b91c65a6ab))
* sign Windows releases against the timestamp URL Certum actually serves ([8e24866](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8e248665961a1946b09b9940b7c6fc5974293878))
* stop a burst of fatal errors writing a crash dump for each one ([a424a9f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a424a9f40637ba83b60df2ee85887f66a0414ec0)), closes [#946](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/946)
* stop an unreadable QRS reply looking like a missing content library ([40064ba](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/40064ba64a42d9fdcc4b93b52907f32bad3ab1b2))
* stop log redaction eating the word after "token" ([ebb1415](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ebb1415b5a6c7104c58e3cd40e8ae83ee1b1bc48)), closes [#949](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/949)
* tell an unreadable certificate apart from a missing one ([bf554ab](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bf554ab5d1c046f31da04dc55f343fbbc61a26cb))


### Miscellaneous

* keep the GitNexus index fresh with git hooks ([ec2f477](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ec2f4779852c5c7b5ae7a83b4847397679253e2f)), closes [#829](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/829)
* refresh generated GitNexus skill files ([cd02e21](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cd02e21ca3a7e932ea10f27082ed565949a327a9))
* retire the flag canary's nightly schedule, and say why it is kept ([9c93385](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9c933859c93c62b8291c7da0dcca4d06b4ca82c2))
* turn Windows code signing off until a certificate is available ([990c0b8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/990c0b82ba25a667aba5dcb76c788bb49327a637))


### Documentation

* correct the note about the pending licences draft ([184b872](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/184b872b3e92576c566f1aa9bb72c8b6269173a7))
* cover the per-app QRS lookups in the staged page ([7c24880](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7c24880593cfd5f1ed0f25f721d008d97c18c42c))
* document the sheet tag options the Cloud thumbnail command reads ([d4b58ef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d4b58ef975cfeec30f32f939d07eb2322a1e4b86))
* mark the browser version selection draft as published ([9b82e81](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9b82e81e2f661f004d76b7f20a4d8e0b228e1407))
* mark the Docker licences page as published ([853bc09](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/853bc09f671fff5c0650f6ac6ac9596e2a17b063))
* mark the exclude and blur sheet number draft as published ([8f636d2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8f636d2c612450a530593b82862e0efd8f107bfd))
* mark the four Docker drafts as published ([1b59574](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b59574d7d1e58df35b67830d9263cc816f1b3e7)), closes [#936](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/936)
* mark the last three staged drafts as published ([caa87b4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/caa87b4dc3de0f7dc8fd4851f7e93aa21135f4f4))
* scope a publishing pass to the file that was actually named ([5e66cf6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e66cf665ba90243fe695a1e73ce4016446eff01))
* stage a page on blurring sheets by tag ([ee250f6](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ee250f62a282a5266b64c755e3747e8802136ccb))
* stage a page on the options and messages that told you the wrong thing ([bdaad0b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bdaad0bc06a4cb78876c453269b1022fcff4a2a6))
* stage a page on the run that would not stop writing crash dumps ([132d8c0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/132d8c0fcc3da1f1a5aae8d3eec63fa1d16b4a25)), closes [#946](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/946)
* stage a page on the two options that never worked ([bc4e945](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bc4e9453a72aa83bda8547fc75154aa92935611e))
* stage the log line that hid the word you needed ([509e791](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/509e791e964254e3cc3df395459b138509ee7dd5))
* stop PR titles duplicating every changelog entry ([a1394b9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a1394b901a6f997226cba5ab890595e198f936fa))

## [4.0.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v3.11.0...butler-sheet-icons-v4.0.0) (2026-08-09)


### ⚠ BREAKING CHANGES

* `--browser firefox` is no longer accepted by `qseow create-sheet-thumbnails` or `qscloud create-sheet-thumbnails`, and Commander validates environment values against an option's choices, so BSI_QSEOW_CST_BROWSER=firefox and BSI_QSCLOUD_CST_BROWSER=firefox now fail at argument parsing rather than later. Firefox never worked on those commands - the launch path speaks the Chrome DevTools Protocol with a Chromium-only argument list - but it was accepted and then failed somewhere the operator could not interpret. `browser install` and `browser uninstall` still support Firefox. Separately, `--browser-version latest` no longer means "the newest published build": it is an alias for `stable` and warns once. `browser uninstall --browser` also gains the choices the other commands have, so it now rejects values it previously accepted and silently ignored.
* Butler Sheet Icons now exits 1 when a command fails or completes with apps it could not process. Scheduled jobs and pipelines that previously always saw exit 0 may start reporting failure. That is the point of the change, but it needs announcing - see docs/to-doc-site/exit-code-now-reflects-failures.md.

### Features

* add crash dump on uncaught errors and harden error handling ([5a2773e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5a2773e08c06731ca3f3b6fdf2707dce930989c9))
* add recommended and stable as browser version keywords ([178bb30](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/178bb30b158085085da0df3be1ebdea6ba4d03cb)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* enhance CI workflow and testing setup ([5b5c6cb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5b5c6cb7db1b2f0cba3ebd355a24265866dea766))
* make the exit code reflect whether the run succeeded ([fef9183](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/fef9183d748d6ed51f77eea87b0212f270ea83a8))
* redact secrets in logs and adopt typed error classes ([540f72b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/540f72b8db141fa7f5cb988b4dde2220a297bc3a))
* report a browser build that cannot be driven ([60935f2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/60935f25e0520fdf3fd243c734ba9e543d4003f5)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* upgrade Puppeteer dependencies and implement retry logic for browser installation ([e28810b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e28810b553a0ccc440f5a257f43fe0d91a7aaa6f))


### Bug Fixes

* address all unresolved PR review comments in build scripts ([70a2d42](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/70a2d4295f726db3ec6db80801e32440af3c8337))
* always release the engine session when removing sheet icons ([499356a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/499356aad7978e1a08c604d1d8e2628ca3445164))
* attach app context when browser installation fails ([007feac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/007feacfab0428734f5cca9ae095ca8ae54a428b))
* await runOverApps so a rejection reaches the caller's catch ([cecb72a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/cecb72a7172fa2ac24917e8b9c9dc4553f339980))
* clear partial install directory before retrying browser install ([5b7f89b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5b7f89b1563553aea1de2cb1f7e46e1149bb4b32))
* correct inverted extensions check in the multipart request path ([467e2c3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/467e2c39cbf804308489b78eb1e533656feb2ae2))
* count per-sheet failures instead of reporting the app as clean ([e49ba3f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e49ba3fadfd653f6ce5face1c192b1a49a0a2f03))
* count per-sheet failures instead of reporting the app as clean ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 5b) ([de06261](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/de062612aa0579f59a305f6f68cb91e535307a0a))
* count sheets attempted, not sheets present ([69d0fa7](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/69d0fa7c20c46c1d3dad1845807b3c57702fd10e))
* default --browser-version to the build Butler Sheet Icons is tested with ([3627ee9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3627ee9688fbadeccc2d210823edb96733ecb947)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* detect cached browsers instead of re-downloading on every run ([3cc940f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3cc940fbf47a203e49544bb98409874d7466db33))
* do not log the QRS config from the shared tag lookup ([21d616b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/21d616bc118a205999cc3f10c5f83f6d4310b9cd))
* escape and encode QRS filter values ([8a7c255](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8a7c25543a6c218c86792228303925e73e574729))
* escape and encode QRS filter values ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 3) ([eb66c03](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/eb66c0352b466aa586d21784cb8f2d969feb457b))
* explain a rejected image directory instead of leaking EACCES ([dcaebed](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dcaebed116d525bb4d2f9f2763c0bd8e11c7c051))
* explain browser list-available failures instead of dumping a stack ([0f0ca16](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0f0ca16791123fdfaedb584250dd6b65c075ef8a))
* fail the app when thumbnail images could not be uploaded ([4c050dc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4c050dc81f572838ca2c4bdac91291bc66c66d8e))
* fix insider-build-mac.sh keychain array and replace node -pe with jq in docker workflow ([76c7d3c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/76c7d3c864b917cbb950584e56b0d808391afa63))
* guard the Cloud sheet metadata reads and fail a sheet whose blur fails ([4815495](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/48154955d8a8fc346aad02f179aca5a210104651))
* guard the Cloud sheet metadata reads and fail a sheet whose blur fails ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 5b) ([358475b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/358475b553cc6c512993190cd9d5d22168dab2e6))
* guard the keychain array expansion in the macOS build scripts ([88b643b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/88b643ba3c4561b5214dec8bc8607f859fd6a7bf))
* guard the Qlik Cloud axios interceptor against missing fields ([3d42bed](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3d42bedd9a7f7d2220770d77974b442f4a534c34))
* guard the shared axios interceptor, and make offline browser commands explain themselves ([2a34a28](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2a34a285cc3a44c9b6d5a95ecf06ff1ea8a5297d))
* keep the generated SEA shim out of the coverage report ([9730558](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/97305584c4822af71e6fd406471005e8d1d138db)), closes [#818](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/818)
* let the Docker image write to a bind-mounted image directory ([4f18bda](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/4f18bda42e76b34ac84a7d303b47b778866bd2db))
* let the Docker image write to a bind-mounted image directory on Linux ([9755504](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/9755504b758ac543fd1d6c9db1df67b43eaa30a3))
* make error and log messages name the right parameter and operation ([dddb10b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dddb10bcdd175628b62655445dd3a9fc751b3321))
* make log messages name the operation actually running ([c7770e4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c7770e47e5b2aa126bd025893970b4ad1fae866e))
* make log messages name the operation actually running ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 3) ([909d5e1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/909d5e1be6f3e78c1b270916db0e646170e6a246))
* make the integration test steps run only their own suite ([5e7361e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5e7361e64f7e0e95a9e69a80422b8ad6ad601823))
* make the Windows CI jobs runner-agnostic ([335dd9a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/335dd9a0d9cf1b48feaf12e4f8e2fa5df7c44f08))
* match the cached browser on a resolved build id ([3adefbb](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3adefbb7c9318fc581399b00dc4e2d36493ebc3c)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* mount the QSEoW Docker job's data through volumes, not host paths ([0eab559](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0eab559a64e28dfffbf8ae54b97a5d135bec0063)), closes [#922](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/922)
* never substitute a cached browser for a version the user pinned ([63a9e7d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/63a9e7d7c9268f87ddb37ffd5f2ced45dca3c879)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* normalise includesheetpart so numeric values reach the right code path ([1b496ba](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1b496ba67a7532b363dc0cfa2e8ab01f4c5e6f51))
* release the engine session when an app fails ([2920ae4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2920ae4b1a6a63cac71bc6eda113ceefcf2be252))
* release the engine session when an app fails ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 2) ([da3e737](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/da3e737eb3b0b6326ea2e08b3a525021e27d448f))
* save each app once instead of once per sheet ([5737ed8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5737ed8654501605e23417f576d9ce8babfea59b))
* save each app once instead of once per sheet ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 5b) ([07b32f9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/07b32f95abec47092854cec15644fe280b163b68))
* skip the exclude-tag QRS lookup when no tags were given ([b0bbfec](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b0bbfecda778033c9aeebb99cd94ed8fede05643))
* skip the exclude-tag QRS lookup when no tags were given ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 3) ([35e410f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/35e410fa718d0bce9c341bec268f9d1478edba61))
* stop --blur-sheet-tag crashing QSEoW with a ReferenceError ([65c518f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/65c518f4fdc2001e6b5824b81e454ed4c9025fa3))
* stop branching on the resolved value of enigma session.close() ([af7e528](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/af7e5285acaa1800d111a8f5fa6895ddad2b191e))
* stop browser error handlers throwing on a nullish rejection value ([987ea76](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/987ea76ce9f64e7ffdbbf43b562bec4fe295df90))
* stop browser install repeating an already-explained failure ([1bbf8a0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1bbf8a0640052aa8c33eca497be9c6f4945fb8dc))
* stop one metadata-less sheet from aborting a whole app ([2163b93](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2163b93e06ce089a038423fa04e0d1395d3f873d))
* stop the browser-arg test asserting the host platform ([6444eb9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6444eb97cdebd045e17478538aef9b8cdd110d96))
* stop the cacheDir test assuming a forward-slash separator ([8f895e0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8f895e019890038019a5592e1c5a3d18ae9f4328))
* stop the macOS signing scripts hijacking the user's keychain ([e1d825d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e1d825d12eca659bbabeccacf1e15cac9f44c5aa))
* stop the macOS signing scripts hijacking the user's keychain, and instrument --single-process ([7cb0d11](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7cb0d1138bd09cb922c03dacfd5cf8bfec9dff74))
* tell a lost engine session apart from a bad sheet ([44a95f1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/44a95f146af5c1020e3f6059df47509227575af3))
* three sheet-icon correctness bugs ([#872](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/872) part 1) ([0973bac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0973bac55496f8470d7289d4739fc79ff4818ea0))


### Miscellaneous

* add a manual macOS signing and notarization canary ([95d4aef](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/95d4aefa550a0b16c73e510fcd35558e26efd205))
* add a temporary Windows npm-layout diagnostic ([a1b07f2](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a1b07f2ac47ea63552cec56aa92357fad04ceb14))
* add environment-free unit tests for QSEoW, Cloud, browser and shared utils ([06a968e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/06a968e908b2ea75b5a8f80d7c27fa5595e9dc9d))
* Add proper source code comments everywhere ([b304669](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b304669b313b6f4ba6ef13b6c4cb1d9f5ba0ed07))
* add unit tests for QSEoW, Cloud, browser and shared util modules ([a6fde9f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a6fde9f63c53d1f7464ce0a882ccc44cd77f88c1))
* apply the .npmrc 7-day quarantine to Dependabot npm updates ([ce3c6d4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ce3c6d4821b770925d2ef88d1677152ab77a5932))
* clarify why the SEA enigma-util test lives in its own file ([110caa9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/110caa978521c648c2f827478acdede1d629b563))
* clear the two remaining zizmor warnings in code scanning ([bd99b03](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/bd99b0318511dc5e6930c7b8ead5cab25ceb3245))
* comment the snyk action pin with the tag it actually points to ([e066f16](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e066f1660dbe3d5d06ceddb73971d4048a653507))
* cover browser version resolution and platform failure paths ([430c719](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/430c719e5fe5670badde49b5025d68ce699ebf3a)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* declare minimum_pre_commit_version for new stage name ([b597ac1](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b597ac1abb29b97227457628ea1e0d897ef58aba))
* delete dead CJS-mocked test files ([d0433c8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d0433c82b216f5344b28dd3fdcc352cd7193b549))
* **deps:** update dependencies to stay safe and secure ([6b1e888](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6b1e888bf550e70c27f24ec7d74e390f38848f50))
* enable ESLint correctness rules ([0f9c6ed](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0f9c6ed501bca2a71199dcbca81769e9e4b8f537))
* enable ESLint correctness rules, and fix the crash they found ([111e0a9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/111e0a9d2e874e472fa6e150bdd4c479a68f5798))
* Enhance project configuration with ESLint and Prettier integration ([5d3232a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5d3232a8dec5c9695ab6a32b62ba9ba1ba931b22))
* exclude redaction test fixtures from secret scanning ([2e8c4f8](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2e8c4f80cebe696df1ad347a629daf214c45526f)), closes [#819](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/819)
* give the process-app test fixtures a real browser version ([c99f0e5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c99f0e503620221a2cee75324ca2080f3d9471f1))
* keep test files out of the coverage report ([8465338](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8465338c65d7830c528b930ba7b9921c7baaa5e8))
* let release-please see back as far as the last release ([1df436e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1df436eff49a8e919d384d68b759d335adc010b1))
* let release-please see the whole backlog, and record Docker mount ownership ([1da7a9b](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1da7a9b86d485d04ac073665ea66343d9c9d3521))
* measure --single-process against machine state before removing it ([54390f9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/54390f940340ea840d4baf4b87c9678aeab793f5))
* move GitHub Actions off the deprecated Node.js 20 runtime ([d9c2bd3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d9c2bd3d9bde9145b0e79355e717d87cf022e26c))
* move the Docker ignore file to the context root and tidy coverage config ([0ae606f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0ae606fcf88f70d7fc03d9ea70082e850a0aa731))
* pin Node with .nvmrc instead of a floating major ([edfe6cc](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/edfe6cce9fb863c2f6ec335bdd878d35984c3136))
* pin npm to 12.0.2 in every job that installs dependencies ([19e788a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/19e788a45705fe3e6cbbf9ec18bd2e812c80aa5d))
* print the effective npm version after pinning ([1667605](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/1667605b66489996fbe6eaf906af13c76dee7bc1))
* quarantine new package releases with min-release-age ([a587417](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a587417c2a4fbe2d299c2c3eddf368d0c07c7976))
* record mounted directory ownership in the Linux Docker jobs ([b20209d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b20209d44d8e9423ea5316d2c6931c025c23bd61))
* refresh generated GitNexus skill files ([e8a0ec3](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e8a0ec38be44ae72db9d692c416548494d4c790d))
* refresh generated GitNexus skill files ([b577349](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b5773497a42df9a75bdeae483d175b2ab4e832ff))
* regenerate GitNexus area skills ([42ffdcd](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/42ffdcd0fbee1f958f9e7c8b2a78b3880f909a3f))
* replace abandoned gha-remove-artifacts with gh CLI cleanup step ([8e577ab](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8e577aba13782b6a6fba2e0c650a05da30e7e2a5))
* route GitNexus through a wrapper that stops managed-block churn ([103caa4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/103caa4b4a86d2b3bc28f5b5ae09fec06fd25c98))
* run lint and unit tests on Windows before merge ([ebce397](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/ebce39770c1d3bf4d3d7489357aa0e0ed68ac8be))
* sharpen the Windows diagnostic to test integrity, not existence ([792e274](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/792e27486fa5cce258d47e9c64aa2f12b0e39d60))
* **tests:** Improve integration and unit tests ([6a86a6a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a86a6a2bd2e3415138f412e72cd03a19b91495b))
* track GitHub Actions versions with Dependabot ([0326d1a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0326d1a1197e0e702323fe0fa8ed8115d4b81c88))
* update commander and snyk dependencies to latest versions ([d0ad2aa](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d0ad2aa6535df8aca2507d48d87d6abb86efc145))
* update dependencies and add Node.js engine requirement ([347f691](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/347f6915ca71e96e82a6221b6f920498fc845148))
* update GitHub Actions workflows and scripts for better security ([0873e49](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0873e49e80c4a73a650355d1ae2b12321cb19e92))
* upgrade pre-commit hooks and use non-deprecated config keys ([06e2e47](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/06e2e475b107495c471714a6b9a59b3d7654d5f2)), closes [#819](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/819)


### Documentation

* add phase 1 design for air-gapped browser support ([47f6b67](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/47f6b67fce0f941b244ac9f4272e9c81a7790ef4))
* correct inaccuracies in staged log redaction page ([7993fa5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7993fa5cb6b7a9308280724180e6911905efc9b4)), closes [#820](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/820)
* design a doctor command for guided error investigation ([6f5fb9a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6f5fb9a4ab41051689104e370dca8aa5c6de8400))
* document the doc-site publishing workflow ([d536a2c](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/d536a2c851bd61c631ac38f1631c67e972614507))
* document which doc site branch a draft belongs on ([370e78f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/370e78fab81963a2ee002ee8a0270d2c25a38fa4))
* mark browser detection doc-site drafts as published ([8f045ac](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/8f045acc44759c14672c474cdf1e9ec98935b1f8))
* mark crash dump and log redaction pages as published ([a51f011](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a51f011cbbd55b5d783d4bb088c636bb205b157f)), closes [#820](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/820)
* mark the exit code draft as published ([37a0fe4](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/37a0fe4de1477e9a6646b8c0ac23e2ada7747908))
* mark the sheet layout and upload failure drafts as published ([97e0ed0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/97e0ed069da88d2c2ad320768e90bc9e6855a51a))
* move processed doc-site drafts into a done/ subfolder ([#860](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/860)) ([b1e2609](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b1e26098f3fc3e51ab2f7015ba270500acede067))
* note the GitNexus hook reads HEAD from the indexed checkout ([0bfa833](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/0bfa833a12c2eb8f039084c939829d729d793fd9))
* publish browser doc-site drafts and record the publishing workflow ([02a7d81](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/02a7d8193c0dd9e97d55649fe719966f9da9b885))
* record that the GitNexus Claude Code hook is a fixable fork ([5c3cdd5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5c3cdd58ba606c2d30f657d489eb2b1e97648d9c))
* record the GitNexus hook fixes that could not be committed ([e2f3502](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e2f35024d4db6b6c227d45e5c47202a43ae1b56f))
* record what gitnexus regenerates, and refresh the generated skills ([6a93f90](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6a93f909a574a7fa11c96ad58eae1d4cfd44ccd3))
* remove stale root copilot-instructions.md ([28a1038](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/28a1038061e06c167a77ec9d9ac6b195f65c4fa0))
* require branching, stopping before git writes, and weighing remaining work ([da2766d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/da2766ded165a2463c0b52e34e1b2d0620ef54c4))
* require branching, stopping before git writes, and weighing work ([a4debc9](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/a4debc9f38bcacc415ea0005ccacd7d485b73750))
* require per-file approval before publishing doc site drafts ([43b4435](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/43b44350c711cc529447349d58d0b9f75eaf920a))
* require user-facing changes to be documented in docs/to-doc-site ([5571ff5](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/5571ff5173b6ef91e0bd71f85366c285364f7d15))
* stage a page on choosing a browser build ([7f5124e](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/7f5124ef7681941cf294dceeee776a0abfdfd0c8)), closes [#878](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/878)
* stage a page on Docker image directory permissions on Linux ([16c195a](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/16c195a0ac96a57a76ccc88d3b0ceada5fef56ab))
* stage guidance on browser commands without internet access ([3a9a816](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/3a9a81676663d92b633920f9db269d2436e50b61))
* stop claiming a qseow remove-sheet-icons command exists ([45eca07](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/45eca07fa0b195f0991d7e305e7a79c80a30ca5e))
* tell agents how to verify against a live QSEoW environment ([6f7229d](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/6f7229da809930bc720bcd3b482839645c119bf0))
* tell the doc site where to find offline browser installers ([dbc955f](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/dbc955ff1a288d0837506bf684c717f744be61bd))

## [3.11.0](https://github.com/ptarmiganlabs/butler-sheet-icons/compare/butler-sheet-icons-v3.10.0...butler-sheet-icons-v3.11.0) (2025-11-28)


### Features

* Add support for suppressing Node.js warnings in created Win/macOS/Linux binaries ([2ba8ea0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/2ba8ea0e0351245fdf6b283356ccef4eb2fad3ae))
* Implement support for sending Node.js runtime flags as parameters to BSI ([b8d1c53](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/b8d1c5338847237610c2482e98b4791087fcc8ea))


### Bug Fixes

* `browser install` command now properly installs the specified browser ([c77b930](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c77b9305501cb379e043120345394920098c5959))
* Suppress the warnings shown when installing browsers, as there isn't much to do about these ([e854e10](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/e854e1001f3178870ea71da0b7a2fae0b9bf278f))


### Miscellaneous

* Add Copilot agents for Documentation Writer, Node.js Architect, and Test Writer roles ([c9c3cc0](https://github.com/ptarmiganlabs/butler-sheet-icons/commit/c9c3cc06531cbe71f9b6d2620a8348ecab1212fd))

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
