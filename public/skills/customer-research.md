---
name: customer-research
description: Gather customer context and turn it into a short briefing.
tools:
  - lookup_account
  - search_runbook
---

# Customer Research Skill

Use this skill when the user asks for a short customer, account, or meeting briefing.

## Workflow

1. Look up account context when an account ID is present.
2. Search the runbook for relevant product or process guidance.
3. Summarize the customer situation, likely opportunities, risks, and suggested questions.
4. Keep the answer short enough to paste into a ticket, CRM note, or meeting prep doc.

## Output Style

- Use headings: Context, Signals, Suggested Actions.
- Clearly label assumptions.
- Do not invent customer facts beyond tool results.
