# Report version 1

`artifact-clash check workflow.yml --json` writes one JSON object to stdout, including on invalid input. Reports are deterministic for the same file content and supplied path. Diagnostics and tables escape terminal control characters through JSON string quoting. No workflows or output files are written by `check`.

## Result and exit precedence

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | `no-shared-names` | Complete within the documented subset; possibly an empty upload inventory |
| 1 | `candidates-found` | Complete subset with at least one shared group |
| 2 | `incomplete` | Some coverage is unknown; computed groups remain present |
| 3 | `invalid-input` | File, UTF-8, YAML, structure or invocation rejected; no inventory returned |

Incomplete coverage takes precedence over candidates. Always inspect `groups` as well as `exitCode`. An incomplete report with no groups is never evidence of global uniqueness.

## Fields

- `schemaVersion`: integer `1`.
- `file`: the path supplied to the CLI, or `null` for invalid invocation.
- `status`, `exitCode`: values from the table above.
- `producers`: ordered by job, step and matrix combination. `id` identifies an instance within this report. `job` is the YAML job key. `stepIndex` is one-based and counts all steps, including non-upload steps. `location` points to the action reference value and `nameLocation` to the name value, falling back to the action reference for an omitted name. Both use one-based `line` and `column`.
- Each producer has `action`, `template`, `name`, `resolution`, `overwrite`, `conditional`, `matrix` and `matrixIndex`. Unresolved names are `null`, never expression text masquerading as a name. `matrixIndex` is one-based; identical axis values retain separate indices. No matrix is `{}`. An unexpanded matrix is `null`, represented by one unresolved source placeholder rather than a guessed number of instances.
- `overwrite` is a boolean or `"unknown"`. `conditional` records an explicit job or step condition. Resolved names may still be conditional.
- `groups`: exact-name matches with two or more producers. `members` contains complete producer objects. `kind` is `shared-name-with-overwrite` if any member explicitly enables overwrite; otherwise `shared-name-candidate`. Unknown overwrite makes coverage incomplete.
- `coverage`: `complete`, direct `uploadSteps`, resolved and unresolved producer counts, and located `diagnostics`. Counts describe represented instances or placeholders, not uploads performed. Reusable calls and unknown action references are located diagnostics without guessed upload inventories.
- `limits`, `limitations`: the fixed resource budget and scope of this release.

## Supported evaluation

Only exact lowercase v4 and v7 major tags are recognized. Default archive mode is supported; v7 false or unknown archive mode is unresolved. Default name and overwrite values come from the official action definitions linked in the baseline comparison. A supplied name must be a string. Leading or trailing whitespace makes a name unresolved because the action's input helper trims it. Noncanonical casing of `name`, `overwrite` or `archive` keys also makes the upload unresolved, avoiding a guessed default. No case folding, normalization or service validation is performed on resolved names.

Matrix axes must be nonempty sequences of literal strings. Cartesian expansion preserves key and value order. Only `${{ matrix.key }}` expressions with a supported existing axis are evaluated. References requiring functions, bracket access, environment, inputs, needs or other contexts stay unresolved. `include` and `exclude` make the entire matrix unknown rather than approximating its result.

When a combination or matrix cell budget would be exceeded, that job retains unresolved upload placeholders. Expanded matrices are capped at 65,536 cells. A separate 8 MiB budget accounts for serialized matrix values, templates, action references, job keys, resolved names and per-instance overhead before retaining each producer; string interpolation checks its budget before constructing a name. If this budget or the producer cap is exhausted, additional expansions are omitted with a located diagnostic for each affected upload step. Known groups remain, coverage is incomplete, and producer counts do not include omitted expansions. Limits are checked before allocating expanded instances. YAML is parsed without alias resolution or object conversion; aliases, merge keys, unknown tags, duplicate keys, multiple documents and excessive nesting are rejected.

The tool inventories direct upload-artifact steps in one workflow only. It does not inspect composite/custom actions, reusable calls, files to upload, dependencies, runners or runtime status. It does not download actions, access GitHub, change versions, edit workflows or initiate CI.
