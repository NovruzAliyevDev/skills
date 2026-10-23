---
name: security-review
description: Review a change for vulnerabilities visible in the code, with evidence for every finding.
argument-hint: "Fixed point (branch, tag, commit) or a path. Defaults to the merge-base with main."
disable-model-invocation: true
---

A code-reading security review, not a penetration test: what an attacker could do with the code as written in this change. One **sub-agent** does the reading and reports back; this skill only scopes the work and presents the report. Report only, never fix.

## Process

### 1. Pin the target

Whatever the user passed is the target.

- A git ref (`main`, a tag, a SHA, `HEAD~3`): review `git diff <ref>...HEAD` (three-dot, against the merge-base) plus `git log <ref>..HEAD --oneline`.
- A path: review that file or directory as it is now, not a diff.
- Nothing: use `main`, else `master`, as the ref. If neither resolves, ask the user for one.

Confirm the ref resolves (`git rev-parse <ref>`) and the diff or path is non-empty before spawning anything.

### 2. Collect the repo's own rules

List every file that documents how this repo handles security: `CLAUDE.md`, `AGENTS.md`, `SECURITY.md`, anything under `docs/adr/` about auth, secrets or data handling. A documented repo decision overrides the lens below.

### 3. Spawn the sub-agent

One sub-agent, in the foreground. Its prompt should include:

- The diff command and commit list, or the path.
- The list of rule files from step 2.
- The **Lens** and **Report format** below, pasted in full (the sub-agent has no other access to them).
- The brief: "Read the target and the rule files. Report every finding in the report format. Report only what the code shows: a risk with no hunk to quote is not a finding. For each, say who can trigger it (anonymous caller, logged-in user, insider) and quote the hunk. Give the direction of the fix, not a rewrite. Under 400 words."

### 4. Present

Show the report verbatim or lightly cleaned. End with one line: findings per severity and the single worst issue.

## Lens

Each item reads *what it is* → *which way to fix*.

- **Injection**: request data concatenated into SQL, a shell command, a file path, an LDAP filter or an HTML template. → parameterise; use the library's own escaping; never build the command from strings.
- **Missing authorization**: a handler checks who the caller is but not whether they may touch *this* record, or a new route skips the check its neighbours have. → check ownership in the handler, the way the neighbours do.
- **Secret in code**: a key, token, password or connection string in source, committed config or a test fixture. → environment or secret store; anything already committed is compromised and must be rotated.
- **Sensitive data in logs or errors**: tokens, personal data or full request bodies logged; a stack trace or SQL text returned to the client. → redact at the log call; return a generic error and log the detail.
- **Unvalidated input**: a body, query, header or upload used without type, length, enum or size checks. → validate at the edge with the repo's validation library.
- **Unsafe deserialization or eval**: `eval`, dynamic import of a user string, a binary or pickle formatter on untrusted bytes, parsed JSON trusted as a known shape. → an allow-list or a safe format.
- **Weak crypto or randomness**: MD5 or SHA1 for passwords, ECB mode, a hand-rolled token, a non-cryptographic random for anything security-relevant. → the platform's password hasher and CSPRNG.
- **SSRF or open redirect**: a URL taken from the request and fetched by the server or used as a redirect target. → allow-list hosts or paths.
- **Dependency change**: a manifest or lockfile adds or bumps a package. Only when the manifest is in the diff. → name the package; flag known CVEs and unpinned ranges.

## Report format

Findings sorted by severity, then by file.

- `blocker`: exploitable by an outside caller with the code as written.
- `should fix`: exploitable only together with another mistake, or by an insider.
- `nit`: hardening; no known path to exploit.

Each finding: `file:line`, one sentence on what is wrong, one on who can trigger it and what they get, one on the direction of the fix, then the quoted evidence.

End with a verdict: **ship**, **fix first**, or **rethink**.
