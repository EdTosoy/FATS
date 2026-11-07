# Local AI development environment

Inspected 2026-11-08 on `chore/fats-ai-dev-environment`, based on merged PR #4
(`origin/main` at `e27daca`). The initial working tree was clean. Local `main`
was left at its existing commit; no user changes were moved or discarded.
No product behavior, dependency, migration, global setting or Git hook changed.

## Responsibilities

Codex implements and inspects changes. Git records reviewed code and docs;
`AGENTS.md` sets repository rules. Graphify can orient structural inspection,
but stale/missing edges require reading current source. ICM can retain a small
verified decision with its source and date; it does not replace source or copy
the documentation. Tests and observable behavior verify implementation.

Work on a task branch, inspect the diff, execute relevant checks and propose a
commit message. Commit, push, merge, deploy, cloud changes and database migrations
are separate manual steps requiring explicit authorization. Tool setup installs
no Git hooks, watchers, autonomous ingestion or deployment automation.

## Existing tools

| Tool              | Observed state                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git               | `origin` is `EdTosoy/FATS`; `legacy` is `EdTosoy/friendly-ats`. Identity exists; no custom hooks path or active Git hooks found. Neither remote nor identity was changed.                                                                       |
| Codex             | CLI 0.167.0; FATS is already trusted. Global config has nine MCP entries, including remote Graphify, and existing hooks/plugins. Preserve it. Its default model is `gpt-6.1-sol`, reasoning high; select task model preferences in the session. |
| Application tools | Node 24.21.0; pnpm 11.27.0 through cached Corepack; installed Nx, TypeScript, ESLint, Prettier, Vitest and Playwright. Use manifests/lockfile for versions.                                                                                     |
| Local utilities   | Python 3.12.14, uv 0.11.21, Nix, Docker and Chromium available. Cargo, Homebrew, pipx and standalone `psql` not found on PATH.                                                                                                                  |
| Graphify          | Local CLI absent; no local index or uv tool installation found. A hosted connector already exists globally/in this session; it was not called.                                                                                                  |
| ICM               | CLI absent; no project store or user config found at the conventional path. No memory was ingested.                                                                                                                                             |
| Obsidian          | Installed (1.15.0 application bundle found); `docs/` is not registered as a vault in the inspected user registry. No plugin or vault was installed.                                                                                             |

The standalone `pnpm --version` launcher stalled during inspection. Cached
`corepack pnpm --version` returned 11.27.0. Use `corepack pnpm <command>` if
needed; do not replace global pnpm or download packages to repair it implicitly.

## Graphify: prepared, installation deferred

Reviewed the [official package/setup](https://github.com/Graphify-Labs/graphify),
[v8 CLI](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/cli.py),
[input discovery](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/detect.py)
and [package extras](https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml).
The package is **graphifyy** (double y); the executable is `graphify`.

Proposed installation commands, **not executed**; review/authorize installation
first. They create an isolated ignored environment, with SQL extraction for the
migrations and no application dependency or user-profile installation:

```sh
uv venv --python python3 --no-python-downloads .tools/graphify
uv pip install --python .tools/graphify/bin/python 'graphifyy[sql]==0.9.103'
.tools/graphify/bin/graphify --version
```

After installation, from the repository root, the proposed first local build is:

```sh
.tools/graphify/bin/graphify extract . --code-only --no-cluster
```

`.graphifyignore` retains web/domain/extension source, migration SQL, test source
and Markdown documentation in the discovery scope. It excludes credentials,
environment files (including examples), private data, tool stores, dependencies,
generated builds, screenshots/media, test output and lockfiles. Keep scanning
from this root with ignore handling enabled and symlink following disabled;
do not add live PostgreSQL introspection. Review discovered paths and extraction
warnings before trusting coverage. Arbitrary secrets embedded in otherwise
allowed source files cannot be excluded by filename rules alone.

**Coverage limit:** `--code-only` deliberately skips the semantic docs/media
pass. Relevant documentation remains in place for direct reading and Obsidian;
full document concept indexing is deferred. Never remove this flag to make a
coverage warning disappear. No hosted model, API key, Graphify Cloud, paid
feature or additional local model is needed for the planned code/SQL pass.

The project `.codex/config.toml` disables the inherited remote server named
`graphify`, using [Codex project-scoped MCP settings](https://learn.chatgpt.com/docs/extend/mcp).
Already loaded plugin tools may still be visible in this session; repository
instructions prohibit using hosted Graphify for this workflow. Global settings
are unchanged. Codex can call the local CLI directly after installation;
no additional MCP server is necessary. Do not run `graphify install` or
`graphify codex install`: those can inject instructions/hooks. If MCP becomes
useful later, separately review the `mcp` extra and a project-only stdio entry
with absolute paths to this checkout's interpreter and graph; verify it before
enabling it. Never register a hosted URL as a substitute.

`graphify-out/`, `.graphify/` and `.tools/` are ignored by Git and formatting.
No graph has been generated. Rebuild explicitly after relevant source changes
or branch switches; never interpret an old index as current evidence.

## ICM: isolated manual decisions, installation deferred

Reviewed the [ICM reference](https://github.com/rtk-ai/icm/blob/main/docs/reference.md),
[default configuration](https://github.com/rtk-ai/icm/blob/main/config/default.toml),
[configuration implementation](https://github.com/rtk-ai/icm/blob/main/crates/icm-cli/src/config.rs)
and [Nix build](https://github.com/rtk-ai/icm/blob/main/flake.nix).
The proposed pinned [0.11.5 release](https://github.com/rtk-ai/icm/releases/tag/icm-v0.11.5)
can be built without installing a global profile or executing an install script:

```sh
mkdir -p .tools
nix build 'github:rtk-ai/icm/icm-v0.11.5#icm' --out-link .tools/icm
.tools/icm/bin/icm --version
```

These commands are **not executed** and need installation approval. Nix will
fetch/build dependencies and may use its configured binary caches. The only
project link is `.tools/icm`; the Nix store is outside Git. No application
manifest/lockfile, user profile, Codex setting or instructions need changing.

`.icm/config.toml` is the only shared ICM file. It selects the project database
and disables extraction/raw-output capture, conversation ingestion, automatic
consolidation, summarizer providers, embeddings/model downloads and cloud sync.
Select the complete config explicitly, avoiding inherited global behavior.
After installation, set these in a terminal **from this repository's root**:

```sh
export ICM_CONFIG="$PWD/.icm/config.toml"
export ICM_DB="$PWD/.icm/memories.db"
export ICM_DB_BACKEND=sqlite
.tools/icm/bin/icm config
.tools/icm/bin/icm --db "$ICM_DB" stats
```

Check that config/database paths stay within this checkout. Test a single
non-sensitive synthetic store/recall in a disposable database before using the
real project store. No memory has been created by this setup. When useful,
store one reviewed decision and recall related decisions with:

```sh
.tools/icm/bin/icm store -t decisions-fats -c '<decision, source path, verified date>'
.tools/icm/bin/icm recall '<question>' --topic decisions-fats
```

Check for an existing decision before adding it. Do not copy these placeholder
strings literally or seed duplicate summaries of AGENTS/docs.
Keep memory databases, journals, queues and backups local; Git ignores all
other `.icm/` entries.

Do not run `icm init`, including `--per-project`: its integration setup can
also edit global Codex settings, instructions and hooks. Manual configuration
preserves the existing files. Do not enable sync, ingestion, hook extraction,
HTTP services or AI providers. Never put passwords, keys, tokens, email codes,
private user data or application/document contents in memory.

## Obsidian: reuse docs

Use Obsidian's **Open folder as vault** and select this checkout's existing
`docs/`, following [the official vault guide](https://help.obsidian.md/Files+and+folders/Manage+vaults).
This is a manual UI step, not performed here. Continue using the same Markdown
files and relative links; do not copy them into another vault or convert links
in bulk. Keep community plugins restricted; install no AI plugins and enable
no sync/publish service. `.obsidian/` settings and `.trash/` are ignored by Git,
formatting and Graphify. A vault registration is user-specific and stays out of
the repository. `AGENTS.md` remains at the repository root.

## Verification boundary

For these documentation/configuration changes, check Markdown formatting,
TOML parsing, representative include/exclude paths, diff whitespace and that
application dependencies, migrations, moodboards and global settings are
unchanged. No build, database, product/browser suite or hosted endpoint is
needed. Tool installation, Graphify parsing/query coverage, ICM runtime
isolation/store/recall and Obsidian UI behavior remain **NOT RUN** until their
manual steps are completed. TOML syntax and ignore-policy checks do not prove
the missing tools' runtime behavior. Do not mark them operational yet.

For product changes, use the commands in `AGENTS.md` and package scripts;
integration checks need authorized dedicated test infrastructure. The hosted
auth blocker and historical full-suite extraction-hash mismatch remain recorded
in `R0_HOSTED_AUTH_VERIFICATION.md` and `R5_VERIFICATION.md`; this tooling task
does not repair or re-evaluate them.

Executed for this change on 2026-11-08:

- **PASS:** Python `tomllib` parsed both TOML files and assertions verified the intended disabled services/providers and project database path.
- **PASS:** An isolated temporary Git repository checked `.graphifyignore` syntax against 23 included paths (including all 14 migrations) and 36 excluded paths. This checks Git pattern semantics, not the missing Graphify runtime.
- **PASS:** `git check-ignore --no-index --stdin` verified that reviewed configuration remains shareable while indexes, memory databases/journals/backups and Obsidian settings/trash stay ignored.
- **PASS:** `codex mcp get graphify --json` resolved `enabled=false` in this checkout; only that boolean was reported, with connection details withheld.
- **PASS:** SHA-256 checks preserved global Codex config, `.git/config`, the application lockfile and all four moodboards. Git checks confirmed local `main` is unchanged and no application, test or migration source was edited.
- Formatting and final diff-whitespace results are reported with the completed task; the initial Markdown formatting warning was corrected with scoped Prettier.
