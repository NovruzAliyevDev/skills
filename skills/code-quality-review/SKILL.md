---
name: code-quality-review
description: Review a change for what will cost the next reader or hide the next bug.
argument-hint: "Fixed point (branch, tag, commit) or a path. Defaults to the merge-base with main."
disable-model-invocation: true
---

Review a change for readability and robustness: whether the next person can read it, and whether a failure in it would be seen. One **sub-agent** does the reading and reports back; this skill only scopes the work and presents the report. Report only, never fix.

## Process

### 1. Pin the target

Whatever the user passed is the target.

- A git ref (`main`, a tag, a SHA, `HEAD~3`): review `git diff <ref>...HEAD` (three-dot, against the merge-base) plus `git log <ref>..HEAD --oneline`.
- A path: review that file or directory as it is now, not a diff.
- Nothing: use `main`, else `master`, as the ref. If neither resolves, ask the user for one.

Confirm the ref resolves (`git rev-parse <ref>`) and the diff or path is non-empty before spawning anything.

### 2. Collect the repo's own rules

List every file that documents how code is written here: `CLAUDE.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CONTEXT.md` or `GLOSSARY.md`. A documented repo standard overrides the lens below. Skip anything a linter or formatter in the repo already enforces.

### 3. Spawn the sub-agent

One sub-agent, in the foreground. Its prompt should include:

- The diff command and commit list, or the path.
- The list of rule files from step 2.
- The **Lens** and **Report format** below, pasted in full (the sub-agent has no other access to them).
- The brief: "Read the target and the rule files. Report every finding in the report format. A repo standard overrides the lens; skip what tooling enforces. Quote the hunk for each finding. Give the direction of the fix, not a rewrite. Under 400 words."

### 4. Present

Show the report verbatim or lightly cleaned. End with one line: findings per severity and the single worst issue.

## Lens

Each item reads *what it is* → *which way to fix*.

- **Name that lies or hides**: a name that says less than the thing does, or something else entirely. → rename to what it does now.
- **Oversized unit**: a function that needs scrolling, nests more than three deep, or handles more than one outcome path. → extract the branches into named steps.
- **Swallowed failure**: an empty catch, catch-log-continue, an ignored return code, a promise or task with no handler. → let it fail, or handle it where the caller can act.
- **Dead code**: an unreachable branch, an unused parameter or export, a flag that is always one value, a commented-out block. → delete it; git remembers.
- **Comment drift**: a comment that describes earlier behaviour or restates the code. → update it or delete it; keep only the why.
- **Untested change**: behaviour changed with no test that would fail if the change were reverted. → a test at the public seam, not of the private helper.
- **Copied logic**: the same shape twice in the change, or once new beside an existing helper that does it. → call the one that exists.
- **Loose type**: `any`, `object`, `dynamic`, a string standing in for an enum, nullable where null is never meant. → the narrow type.

## Report format

Findings sorted by severity, then by file.

- `blocker`: hides a bug or makes one likely (a swallowed failure, an untested behaviour change).
- `should fix`: will cost the next reader real time.
- `nit`: taste.

Each finding: `file:line`, one sentence on what is wrong, one on why it matters here, one on the direction of the fix, then the quoted evidence.

End with a verdict: **ship**, **fix first**, or **rethink**.
