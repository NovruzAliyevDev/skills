---
name: delegate
description: Break a big task into independent pieces and run each in its own subagent, keeping the main agent's context light. Use when: delegate, split this up, use subagents, fan out, parallelize, orchestrate.
---

# Delegate

The main agent plans and integrates. It does not read the material.
Everything bulky — source files, search sweeps, page fetches, log digging,
test runs — happens inside a subagent, and only a short written result
comes back.

## First, check that fan-out is worth it

Delegation is not free. A subagent starts cold: it re-derives context the
main agent already has, and its answer has to be read again on the way
back. On a small task that is pure overhead.

Fan out when at least two of these hold:

- the work splits into 3 or more pieces that don't need each other's output
- each piece requires reading far more than its answer is worth
- the pieces touch different files, services, or sources
- one agent doing all of it would run out of room before finishing

Otherwise do the work inline and say so in one line — "this is two file
edits, delegating would be slower." Never spawn an agent to look busy.

## Split the work

Write the split down before spawning anything. A good piece:

- is answerable without any other piece's output
- has one deliverable and one owner
- is named by its deliverable, not its activity — "list every place the
  order total is recalculated" beats "look at the order code"
- fits one pass: one question, one area, one file set

If two pieces would read the same large thing, merge them. Otherwise the
same cost is paid twice.

Keep the split visible in the task list so a returning user can see what
ran and what is left.

## Write the brief once

Put everything shared into one scratchpad file: the goal, the repo or data
layout, naming conventions, definitions, the output format. Give every
agent that file's path instead of repeating the same paragraphs in six
prompts. One file also means six agents work from the same definitions.

## Brief each agent as if it knows nothing

It does. A subagent inherits no conversation, no earlier findings, no
user preferences. Each prompt carries:

- the goal, in one sentence
- the path to the shared brief
- exactly which files, paths, or sources it owns
- what is out of scope — don't read past your slice, don't touch files you
  don't own, don't spawn agents of your own
- the return format and its size limit
- where to put long output: a file in the scratchpad, not the reply

If a prompt can't be written without "as we discussed above," the piece
isn't self-contained yet. Re-scope it.

## Bound what comes back

This is the rule that keeps the main agent light. State it in every prompt:

- return at most ~20 lines: findings, conclusions, `file:line` references
- never return file contents, full logs, or raw search output
- long artifacts go to a file — return the path and one line describing it
- found nothing? return "nothing found" plus where you looked, not an
  apology

An agent that returns 400 lines has moved the problem, not solved it.

## Run them

Issue every independent spawn in a single block so they run at once.
Sequence only genuine dependencies, and hand the downstream agent the
predecessor's summary or output-file path — never its raw work.

Depth is one. Subagents do not spawn subagents; nested fan-out multiplies
cost and nobody is left holding the plan.

To follow up with an agent that already has the context, message it rather
than spawning a fresh one.

## Keep writes apart

Two agents writing the same file corrupt it quietly. Either give each agent
a disjoint set of paths it owns, or make every agent read-only and let the
main agent apply the edits from their reports. Say which mode is in force
in every prompt.

## Integrate

The main agent reads only the summaries and assembles the deliverable
itself. Where two reports contradict each other, ask the relevant agent one
narrow follow-up rather than re-reading the source. Where a report is
vague, send it back with a sharper question — don't paper over it.

## Verify

One last agent, fresh, checks the assembled result against the original
request: does it answer what was asked, do the references resolve, does
anything contradict. It reports; it does not fix.

## When an agent comes back empty

Re-scope and respawn once, with a narrower question or a different slice.
If the second attempt fails too, the main agent does that one piece itself
and notes the gap in the final report. Never loop on the same failing
spawn.

## Budget

Default ceiling: about 6 agents per round, 2 rounds. Past that, stop and
report what is known and what is still open, rather than spending more.

## Report

Tell the user how the work was split, one line per piece on what it found,
and then the integrated answer. Don't paste agent transcripts — the point
of the whole exercise was not to carry them.
