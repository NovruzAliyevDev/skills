---
name: review-all
description: Run the architecture, security and code quality reviews on one target and report them side by side.
argument-hint: "Fixed point (branch, tag, commit) or a path. Defaults to the merge-base with main."
disable-model-invocation: true
---

Three reviews of one target, run as **parallel sub-agents** so none pollutes the others, then presented side by side. Report only, never fix.

## Process

### 1. Pin the target

Same rule as each single review. A git ref means `git diff <ref>...HEAD` (three-dot) plus `git log <ref>..HEAD --oneline`; a path means that path as it is now; nothing means `main`, else `master`, else ask the user. Check once, here, that the ref resolves (`git rev-parse <ref>`) and the diff or path is non-empty. A bad target should fail here, not inside three sub-agents.

### 2. Collect the repo's own rules

List every file that documents how this repo is built, secured and written: `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md` or `GLOSSARY.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, anything under `docs/adr/`. A documented repo decision overrides every lens.

### 3. Spawn three sub-agents

Issue all three calls together, in the foreground. Each prompt should include:

- The diff command and commit list, or the path.
- The list of rule files from step 2.
- The path of its skill file, in the folder beside this one: `architecture-review/SKILL.md`, `security-review/SKILL.md` or `code-quality-review/SKILL.md`.
- The brief: "Read that skill file. Skip its Process section; the target is already pinned. Apply its Lens to the target, follow the brief in its step 3, and write the report in its Report format. Under 400 words."

### 4. Present

Three sections, `## Architecture`, `## Security` and `## Code quality`, each report verbatim or lightly cleaned and in its own severity order. Do **not** merge or rerank across sections: a security blocker and an architecture blocker measure different things.

End with one line per section: findings per severity, that section's worst issue, and that section's verdict. There is no single verdict across the three.
