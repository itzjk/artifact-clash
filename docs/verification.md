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

The README now documents `npm ci && npm i -g .` from the root of an existing clone, followed by `artifact-clash check examples/os-only.yml`. The GitHub quick start remains available.

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

## Outstanding delivery checks

- `npm run record` cannot start the VHS browser in this environment: `browser exited unexpectedly before its debugging endpoint was ready`. The tape is valid and contains the three real CLI runs, but `docs/demo.gif` has not been produced. The README currently displays terminal output. The required recorded GIF remains outstanding.
- The exact GitHub installation command exited 128 with SSH authentication denied. The anonymous repository API returned 404. A public GitHub installation cannot be certified until the repository is accessible. Local tarball installation succeeded independently.
- A repository commit was attempted with the requested author identity. Git could not create `.git/index.lock` because this environment restricts writes to the Git metadata directory. No commits, pushes or publication were made.
- The CI workflow exists and passes actionlint, but hosted CI has not been initiated. Its checkout and setup-node actions are fixed to the published v7.0.1 and v7.1.0 commit IDs, respectively; their manifests use Node 24.

Next: record the tape in an environment where VHS can launch its browser, embed the generated GIF, then repeat installation and hosted checks after the owner makes the repository public. The local analyzer handles both existing and newly written workflow files within the same documented subset.
