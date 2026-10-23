---
name: architecture-review
description: Review a change or a module for structural problems that get expensive to fix later.
argument-hint: "Fixed point (branch, tag, commit) or a path. Defaults to the merge-base with main."
disable-model-invocation: true
---

Review the structure of a change, not its line-by-line quality: where code lives, what depends on what, and which decisions will be expensive to reverse. One **sub-agent** does the reading and reports back; this skill only scopes the work and presents the report. Report only, never fix.

## Process

### 1. Pin the target

Whatever the user passed is the target.

- A git ref (`main`, a tag, a SHA, `HEAD~3`): review `git diff <ref>...HEAD` (three-dot, against the merge-base) plus `git log <ref>..HEAD --oneline`.
- A path: review that file or directory as it is now, not a diff.
- Nothing: use `main`, else `master`, as the ref. If neither resolves, ask the user for one.

Confirm the ref resolves (`git rev-parse <ref>`) and the diff or path is non-empty before spawning anything.

### 2. Collect the repo's own rules

List every file that documents how this repo is meant to be built: `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md` or `GLOSSARY.md`, `ARCHITECTURE.md`, anything under `docs/adr/`. A documented repo decision overrides the lens below: where an ADR endorses something the lens would flag, the finding is suppressed.

### 3. Spawn the sub-agent

One sub-agent, in the foreground. Its prompt should include:

- The diff command and commit list, or the path.
- The list of rule files from step 2.
- The **Lens** and **Report format** below, pasted in full (the sub-agent has no other access to them).
- The brief: "Read the target and the rule files. Report every structural finding in the report format. A repo document overrides the lens. Quote the hunk or name the symbol for each finding. Give the direction of the fix, not a rewrite. Under 400 words."

### 4. Present

Show the report verbatim or lightly cleaned. End with one line: findings per severity and the single worst issue.

## Lens

Each item reads *what it is* → *which way to fix*. Every finding is a judgement call and is labelled as one.

- **Dependency direction**: an inner layer (domain, core) imports an outer one (HTTP, DB, UI, framework). → invert it: the inner layer declares the interface, the outer one implements it.
- **Boundary leak**: a transport or storage type (ORM entity, request DTO, SQL row) crosses into domain logic or out through a public API. → map at the boundary; keep the inside in its own types.
- **Shallow module**: an interface as big as its implementation, so callers must know how it works to use it. → pull the complexity inside, shrink the interface.
- **Mixed reasons to change**: one module edited for unrelated reasons (a pricing rule and a retry policy in one place). → split along the reasons.
- **Cycle**: A needs B and B needs A, directly or through a chain. → extract what both need into a third module that depends on neither.
- **Decision in the wrong place**: a business rule in a controller or UI, an environment lookup deep in domain code, orchestration inside a repository. → move the decision to the layer that owns it.
- **Speculative structure**: a layer, interface or plugin point with one implementation and no stated second use. → inline it until a real second use appears.

## Report format

Findings sorted by severity, then by file.

- `blocker`: expensive to reverse once more code is built on it.
- `should fix`: wrong but still local; fix before anything depends on it.
- `nit`: a matter of taste in structure; no cost if left.

Each finding: `file:line`, one sentence on what is wrong, one on why it matters here, one on the direction of the fix, then the quoted evidence.

End with a verdict: **ship**, **fix first**, or **rethink**.
