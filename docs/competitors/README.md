# Baseline comparison

On 2026-10-30, before implementation, the three workflows in `examples/` were run through released Darwin ARM64 binaries:

| Tool | Version | Constant / OS only / both axes |
| --- | --- | --- |
| [actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) | 1.7.12 | Exit 0, no findings for all three |
| [zizmor](https://github.com/zizmorcore/zizmor/releases/tag/v1.31.1) | 1.31.1 | Exit 14, unpinned action reference for all three |
| [sisakulint](https://github.com/sisaku-security/sisakulint/releases/tag/v0.3.8) | 0.3.8 | See captured output for reference pinning, Dependabot and runtime findings |

`results.json` records commands, exit codes, stdout, stderr and workflow SHA-256 hashes. Each command also has a text capture. Actionlint's optional shell and Python analyzers were disabled; the fixtures have no scripts. Zizmor ran offline. Sisakulint used its default checks without credentials or autofix. Its initial invocation failed because the empty repository lacked `.github/workflows`; after creating that directory, the same files were analyzed successfully.

None of these runs printed expanded artifact names, shared-name groups or their matrix producers. This is a comparison of these versions and defaults on three fixtures, not a claim that no other tool or configuration can solve the problem. They remain useful complementary syntax and security checks.

The official [v4 definition](https://github.com/actions/upload-artifact/blob/v4/action.yml) and [v7 definition](https://github.com/actions/upload-artifact/blob/v7/action.yml) were read on the same date. Both default to `artifact`; v7 with `archive: false` ignores `name` and needs file knowledge, so it is outside this analyzer's supported subset.
