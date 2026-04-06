# Ticket System (GitHub Issues)

All work is tracked in GitHub Issues on this repository.

## Workflow

1. **Create a new work item:**
   - Create a GitHub issue with clear acceptance criteria
   - Use labels for priority and type

2. **Link PRs to issues:**
   - In PR description, use "Fixes #N" or "Closes #N"

## Rules

- Every piece of planned work has an issue
- Issues are self-contained — another agent should be able to implement without asking questions
- Acceptance criteria are concrete and testable
- PRs reference their issue number in the description
- Commits reference their issue ID: `feat(agents): add planning agent (#123)`

## Issue Format

```markdown
## Description

What to implement.

## Acceptance Criteria

- [ ] Concrete criterion 1
- [ ] Concrete criterion 2
```
