# Verification record

Checked on 2026-10-30. No workflows were uploaded or run in GitHub Actions.

| Check | Observed result |
| --- | --- |
| Fresh source copy, `npm ci` with an isolated npm cache | Exit 0; one dependency, zero vulnerabilities |
| Fresh source copy, `npm test`, Node 24.16.0 | 79 tests passed, zero failures, zero skipped |
| Fresh source copy, `npm test`, Node 22.23.4 | 79 tests passed, zero failures, zero skipped |
| Independent reviewer, separate fresh copy | 79 tests passed; package installation and six README command checks passed |
| `npm pack` and prefix-isolated global tarball installation | Exit 0; installed executable works outside source directory |
| Constant example | Four producers, one group of four, exit 1 |
| OS-only example | Four producers, two groups of two, exit 1 |
| Both-axis example | Four distinct names, zero groups, exit 0 |
| Partial fixture | Known group retained with both source locations, unknown matrix placeholder retained, exit 2 |
| Workflow SHA-256 checks | Every fixture unchanged after CLI checks |
| Script bait and guarded network/process APIs | No scripts, actions, network calls or subprocesses executed by the CLI; guard positive control failed as expected |
| Actionlint 1.7.12 on CI configuration | Exit 0 |
| `vhs validate docs/demo.tape` | Exit 0 |

The independent review found whitespace normalization, case-insensitive action inputs and noncanonical action references that could otherwise yield a false clean result. Nine reproductions now return incomplete coverage with unresolved affected names. Two additional reviewer probes confirmed matrix cell and expanded string limits retain earlier known groups.

## Negative verification

Three isolated source mutations were tested against six selected integration cases. The unchanged source passes all six. Each mutation caused assertion failures:

| Mutation | Failed selected tests |
| --- | --- |
| Compare the template without interpolation | 3 |
| Group separately for each job | 2 |
| Deduplicate producers with identical job, step and matrix | 1 |

The full suite additionally exercises malformed YAML, duplicate keys, recursive aliases, merge keys, unverified versions, dynamic matrices, include/exclude, missing axes, unknown contexts/functions, explicit conditions, empty names, overwrite, archive mode, byte/node/depth caps and combination/cell/string expansion caps. Fixtures and the independent Python calculation are stored under `test/`.

## README local-install follow-up

The README documents `npm ci && npm i -g .` as a local installation note under Contributing. The GitHub quick start remains available.

Verified on 2026-10-30 in a fresh local Git clone with no `node_modules`, an empty isolated npm cache and an isolated global prefix, using Node 24.16.0 and npm 11.13.0:

| Check | Observed result |
| --- | --- |
| `npm ci && npm i -g .` | Exit 0; the installed command resolves inside the isolated prefix |
| `artifact-clash check examples/os-only.yml` | Exit 1; four producers, two groups of two with both Node versions visible |
| Installed command from outside the clone, JSON output | Same two groups and all four producers |
| Installed help, version and unique example | Exit 0; version 0.1.0 and four distinct example names |
| Constant example, JSON output | Exit 1; one group containing all four producers |
| Quick-start workflow path populated with the unique example | Exit 0; four distinct names |
| `npm ci` followed by `npm test` | Exit 0; 79 passed, zero failed, zero skipped |
| Example workflow SHA-256 hashes | Unchanged after all checks |
| GitHub installation command, retried separately | Exit 128; SSH host key verification failed, so remote installation remains unverified |

## Round 3 follow-up

Verified on 2026-10-30 with Node 24.16.0 and npm 11.13.0 in a new local Git clone. The current README and package manifest were copied into that clone before installation; its npm cache and global prefix were isolated.

| Check | Observed result |
| --- | --- |
| `npm ci` | Exit 0; zero vulnerabilities |
| `npm test` with the explicit spec reporter | Exit 0; 79 tests, 79 passed, zero failed, zero cancelled, zero skipped |
| `npm i -g .` | Exit 0; installed executable works outside the clone |
| Three examples, human and JSON output | Constant: one group of four, exit 1; OS only: two groups of two, exit 1; both axes: four distinct names, exit 0 |
| Group members and provenance | Names, ordered matrix values and member indices match `test/reference.json`; all grouped producers retain job `build`, step 1, line 13, column 15 |
| Installed help, version and quick-start workflow path | Exit 0; version 0.1.0; four distinct names at the quick-start path |
| `npm run demo` | Exit 1; two shared-name groups |
| Example workflow SHA-256 hashes | Unchanged after checks |
| Independent reviewer, separate clean clone | 79 tests passed; local installation, external CLI invocation, exact example members and source locations, unchanged hashes, help and version confirmed |
| README | 712 whitespace-delimited words; installation and usage remain two separate quick-start blocks; the explanatory exit-code sentence was removed |
| `vhs validate docs/demo.tape` | Exit 0 |
| `npm run record` | Exit 1 before recording; no GIF produced |
| GitHub installation | Exit 128, SSH host key verification failed; anonymous repository API returned HTTP 404 |

## Round 4 recording retry

Retried on 2026-10-30 with VHS 0.12.1, Node 24.16.0 and npm 11.13.0. Installation and CLI checks used a new local Git clone with an empty isolated npm cache and a separate global prefix.

| Check | Observed result |
| --- | --- |
| `npm ci` | Exit 0 |
| `npm test` | Exit 0; **79 tests, 79 passed, 0 failed, 0 cancelled, 0 skipped** |
| `npm i -g .` | Exit 0; installed help and version work outside the clone |
| Three examples, human and JSON output | Constant: one group of four, exit 1; OS only: two groups of two, exit 1; both axes: four distinct names, exit 0 |
| Producer provenance and workflow hashes | All four producers retain job `build`, step 1, line 13, column 15; all three example hashes remain unchanged |
| Quick-start workflow path, populated with the unique example | Exit 0 |
| `npm run demo` | Exit 1; two shared-name groups |
| `vhs validate docs/demo.tape` | Exit 0 |
| `npm run record` | Exit 1; `could not start browser: browser exited unexpectedly before its debugging endpoint was ready`; no GIF produced |
| Separate headless Chromium launch on `about:blank` | Terminated with signal 5; `bootstrap_check_in` reported `Permission denied (1100)` |
| `npm i -g github:itzjk/artifact-clash` | Exit 128; GitHub SSH authentication failed with `Permission denied (publickey)` |

The test summary is printed by the existing explicit spec reporter. Passing tests and validating the tape do not satisfy the demo requirement: `docs/demo.gif` is still absent, so the README GIF embed and the measured 10–25 second duration remain unverified. This retry does not close the delivery blocker.

## Outstanding delivery checks

- `npm run record` cannot start the VHS browser in this environment: `browser exited unexpectedly before its debugging endpoint was ready`. A direct headless browser diagnostic terminates at macOS `bootstrap_check_in` with `Permission denied (1100)`. The tape is valid and contains the three real CLI runs, but `docs/demo.gif` has not been produced. The README retains terminal output without a broken image link. The required 10–25 second recorded GIF and its README embed remain outstanding.
- The exact GitHub installation command exited 128 with SSH authentication denied, including the round 4 retry. The earlier anonymous repository API returned 404 and was not queried again in round 4. A public GitHub installation cannot be certified until the repository is accessible. Local installation succeeded independently.
- A repository commit was attempted with the requested author identity. Git could not create `.git/index.lock` because this environment restricts writes to the Git metadata directory. No commits, pushes or publication were made.
- The CI workflow exists and passes actionlint, but hosted CI has not been initiated. Its checkout and setup-node actions are fixed to the published v7.0.1 and v7.1.0 commit IDs, respectively; their manifests use Node 24.

Next: record the tape in an environment where VHS can launch its browser, embed the generated GIF, then repeat installation and hosted checks after the owner makes the repository public. The local analyzer handles both existing and newly written workflow files within the same documented subset.
