---
name: triage
description: Triage an operational issue, inspect context, and recommend next steps.
tools:
  - search_runbook
  - lookup_account
  - create_follow_up_task
---

# Triage Skill

Use this skill when the user wants help investigating an operational issue, rollout risk, incident, support escalation, or account-specific blocker.

## Workflow

1. Identify the affected account, product, and user-visible impact.
2. Look up relevant account context if an account ID is present or implied.
3. Search the runbook for related operational guidance.
4. Create a follow-up task only when there is a clear unresolved action.
5. Return a concise summary with severity, likely next owner, and next steps.

## Output Style

- Start with the recommended action.
- Include tool evidence used.
- Avoid pretending mock data is production data.
