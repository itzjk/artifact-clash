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

## Delivery completion, 2026-10-31

The CLI implementation was retained. The recording now waits for complete output before showing the first frame, displays all three naming choices, and requires only Node from the clone. The README embeds the resulting GIF and contains 668 whitespace-delimited words.

| Check | Observed result |
| --- | --- |
| Fresh local Git clone, isolated npm cache, `npm ci` | Exit 0; zero vulnerabilities |
| Fresh clone, `npm test`, Node 24.16.0 and npm 11.13.0 | Exit 0; 79 passed, zero failed or skipped |
| Prefix-isolated `npm i -g .` | Exit 0; installed CLI works outside the clone |
| Three examples, human and JSON output | Constant: one group of four, exit 1; OS only: two groups of two, exit 1; both axes: four distinct names, exit 0 |
| Exact group membership and provenance | Ordered combinations match the Python reference; every producer retains job `build`, step 1, line 13, column 15 |
| Workflow hashes, installed help/version, quick-start path | Hashes unchanged; help/version and populated quick-start path return exit 0 |
| `npm run demo` from fresh clone | Exit 1; two shared-name groups |
| Independent reviewer, separate clean source copy | 79 tests passed; local and packed installation, exact example members and locations, boundary probes and unchanged hashes confirmed |
| Nine competitor commands, same released versions | Same exit codes and findings; no expanded shared-name groups or matrix producers; captures in `competitors/recheck-2026-10-31.json` |
| CI configuration and tape validation | Actionlint and `vhs validate docs/demo.tape` return exit 0 |
| Fresh clone, `npm run record` with local VHS build | Exit 0; GIF generated from the real CLI |
| `ffprobe` on final GIF | 17.24 seconds, 1240 × 600 pixels, 431 frames, 441,772 bytes |
| GIF frames at 0, 8 and 16 seconds | Complete constant, OS-only and unique results; all producers and group members visible without clipping |
| Public text scan and `git diff --check` | Passed |
| Exact `npm i -g github:itzjk/artifact-clash` retry | Exit 128; SSH authentication denied |

The system VHS invocation still failed to launch its default browser. Recording succeeded by selecting Chromium Headless Shell with an existing local VHS build that changes browser selection and process flags. Capture and encoding remain VHS; no output substitution or post-recording retiming was used. This environment-specific build is not part of the package. On a host where VHS starts its browser normally, use `npm ci` followed by `npm run record`.

Both default artifact names were reconfirmed against the official v4 and v7 action definitions on this date. The dated issue reaction count in the README is historical evidence of the upload problem, not a demand measurement for this CLI.

## Outstanding delivery checks

- Public GitHub installation remains unverified: the exact command returned SSH `Permission denied (publickey)`. Local source and packaged installations pass.
- Hosted CI has not been initiated. The checked-in workflow passes actionlint locally.
- Git metadata is read-only in this environment. The current changes remain in the working tree; no commits, pushes or publication were made.

Next: commit the reviewed files in a writable checkout, then verify GitHub installation and hosted CI after the owner makes the repository accessible. The local analyzer handles both existing and newly written workflow files within the same documented subset.
