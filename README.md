# artifact-clash

See which GitHub Actions matrix combinations would upload the same artifact name before running CI.

[![CI](https://github.com/itzjk/artifact-clash/actions/workflows/ci.yml/badge.svg)](https://github.com/itzjk/artifact-clash/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

```text
artifact-clash: "examples/os-only.yml"

NAME | JOB | STEP | LINE:COL | MATRIX | OVERWRITE
"bundle-ubuntu-latest" | "build" | 1 | 13:15 | os="ubuntu-latest", node="20" | false
"bundle-ubuntu-latest" | "build" | 1 | 13:15 | os="ubuntu-latest", node="22" | false
"bundle-windows-latest" | "build" | 1 | 13:15 | os="windows-latest", node="20" | false
"bundle-windows-latest" | "build" | 1 | 13:15 | os="windows-latest", node="22" | false

2 shared-name group(s)
```

## Quick start

Install with Node.js 22 or newer:

```sh
npm i -g github:itzjk/artifact-clash
```

Check one local workflow:

```sh
artifact-clash check .github/workflows/build.yml
```

From an existing clone, run `npm ci && npm i -g .` in the repository root to install the same `artifact-clash` command. Try the included example with `artifact-clash check examples/os-only.yml`; exit code 1 means it found the two shared-name groups.

## Features

- Preview every supported upload with its resolved name and matrix values.
- Trace shared names to each job, step index, source line and combination.
- Find matches across jobs and between separate steps in the same job.
- Keep known groups visible when another producer cannot be resolved.
- Export a versioned JSON report with coverage diagnostics and resource limits.

## Why

The closed [upload-artifact issue #478](https://github.com/actions/upload-artifact/issues/478) documents a v4 migration that hit `409 Conflict` when jobs shared an artifact name. The [official guidance](https://github.com/actions/upload-artifact#not-uploading-to-the-same-artifact) recommends incorporating matrix dimensions, but adding only the operating system still leaves matching names when Node versions vary. Artifact-clash shows the combinations left behind by that partial fix; it complements actionlint and zizmor, whose [baseline runs](docs/competitors/README.md) did not print these groups.

## How it works

The CLI reads a single YAML file, retains source locations, expands literal string axes in their written order, and substitutes `matrix.key` expressions in direct upload steps. It groups resolved names across the whole workflow, retaining repeated values as separate producers. Every group lists all its members. An omitted `with.name` becomes `artifact`; an explicit empty name receives a separate diagnostic. Scripts, jobs and actions are never executed, workflows stay untouched, and checks make no network requests.

## Usage

| Command or option | Result |
| --- | --- |
| `artifact-clash check workflow.yml` | Upload table, groups and coverage |
| `artifact-clash check workflow.yml --json` | JSON schema version 1 |
| `artifact-clash --help` | Syntax and exit codes |
| `artifact-clash --version` | Installed version |

Exit **0** means no shared names in the complete supported subset, including an explicitly empty inventory. Exit **1** means candidates were found. Exit **2** means coverage is incomplete, with any known groups still included. Exit **3** means invalid input or invocation. [Report details](docs/report-v1.md) define producer fields, locations and precedence.

## FAQ

**Does a candidate guarantee a failed upload?** No. `shared-name-candidate` means multiple planned producers resolve to exactly the same name. Conditions, earlier failures or missing files can prevent uploads. The report predicts neither execution order nor a winner.

**Does overwrite solve the problem?** A group containing `overwrite: true` becomes `shared-name-with-overwrite`. Deleting an existing artifact can lose earlier results; the tool displays this setting without recommending it.

**Which action references work?** Exact `actions/upload-artifact@v4` and `@v7`. SHA references and other versions receive located coverage diagnostics. For v7, `archive: false` ignores `name` and uses the filename, so that mode remains unresolved.

**Can I try the matrix example?** The three workflows in `examples/` use two operating systems and two Node versions: `constant.yml` has one group of four producers, `os-only.yml` has two groups of two, and `unique.yml` has four distinct names. Compare them with the same check command.

## Limitations

- Dynamic matrices, `include`/`exclude`, non-string axis values, functions and other expression contexts are unresolved.
- Explicit `if` conditions and reusable workflows make coverage incomplete. Composite and other action internals are outside the direct-step inventory.
- Names use literal comparison; service naming restrictions and all equivalence rules are not certified.
- Names requiring whitespace trimming and noncanonical input-key casing are unresolved.
- Inputs are capped at 1 MiB, 50,000 YAML nodes and depth 100. Duplicate keys, merge keys and aliases are rejected. Expansion budgets are 4,096 combinations, 65,536 matrix cells, 16,384 producers and 8 MiB of expanded strings per workflow.

## Contributing

From a clone with Node.js 22+ and Python 3, run `npm ci` then `npm test`; include a fixture with exact expected producers when changing analysis behavior.

## License

[MIT](LICENSE).
