## node-package-version-diff

This is a **work in progress** project to find version differences between node package manager lock files. The output formats may change in future versions, especially if workspace support is added.

### Dependency trees

Note that npm flattens packages in `node_modules` when possible. The original dependency tree is not preserved. For example if `module-x` is a dependency of `module-a` and `module-b`, and a common version of `module-x` can satisfy both `module-a` and `module-b` version requirements, then `module-x` is added directly to `node_modules` instead of being nested under `module-a` and `module-b`. The package lock file maintains version information in this flattened structure as well. It is not a goal of this project to reconstruct dependency trees. Path and version information output by this tool are based on the final dependency structure computed by the package manager. It _is_ still possible to identify whether a dependency is a direct or transitive dependency (see CLI flag `--direct-only`); it's just that transitive dependencies may or may not have path information that indicate their parent packages.

pnpm does not flatten packages, so the path information output by this tool _happens_ to also represent the original dependency tree.

### Known limitations

- Only npm lock file format v3 and pnpm lock files are currently supported.
- pnpm support has only been tested against lock file format v9. Other versions may or may not work as expected.
- Including or omitting `peer` type dependencies is not supported in pnpm mode. Those dependencies will be included automatically with their associated `prod`, `dev`, and `optional` dependencies.
- Workspaces are not yet supported with any package manager.

### Usage

```
Usage: npvd [options] <from> <to>

Arguments:
  from                    From lock file or git commit
  to                      To lock file or git commit

Options:
  --mode <pkgmgr>         Package manager (npm, pnpm) (default: "npm")
  --include <deptype>     Dependency types to include (prod, dev, optional, peer)
  --omit <deptype>        Dependency types to omit (dev, optional, peer)
  --direct-only           Only include direct dependencies
  --git                   Interpret <from> and <to> as git commits
  --git-lock-file <path>  Path to lock file relative to repository root
  --format <format>       Output format (text, json, csv) (default: "text")
  --json-spaces <num>     Number of spaces to use for indentated JSON output
  --eol <eol>             End of line to use for file output (LF, CRLF) (default: "LF")
  --out-file <path>       File path including file name where output should be written
  -h, --help              display help for command
```

#### Example: diff two npm lock files and output to the console

Output all changes

```sh
$ npvd a/package-lock.json b/package-lock.json
```

Output only changes to direct, prod dependencies

```sh
$ npvd a/package-lock.json b/package-lock.json --include prod --direct-only
```

#### Example: diff two npm lock files by git revision and output to the console as indented json

Output all changes

```sh
$ npvd 2753c5b main --git --format json --json-spaces 2
```

Output only changes to direct, non-dev dependencies

```sh
$ npvd 2753c5b main --git --format json --json-spaces 2 --omit dev --direct-only
```

#### Example: diff two pnpm lock files and output to a CSV file

Output all changes

```sh
$ npvd a/pnpm-lock.yaml b/pnpm-lock.yaml --mode pnpm --format csv --out-file version-diff.csv
```

Output only changes to direct, prod dependencies

```sh
$ npvd a/pnpm-lock.yaml b/pnpm-lock.yaml --mode pnpm --include prod --direct-only --format csv --out-file version-diff.csv
```
