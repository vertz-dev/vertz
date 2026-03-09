# Ticket System (GitHub Projects)

All work is tracked in GitHub Projects instead of local markdown files.

## Where Tickets Live

- **Active tickets** → GitHub Projects board (#2): https://github.com/orgs/vertz-dev/projects/2
- Use the board to view all work items, their status, and assignments

## Workflow

1. **Create a new work item:**
   - Create a GitHub issue first
   - Add it to the project board using `gh project item-add` or the GitHub UI
   - Items start in "Todo" column

2. **Move items through columns:**
   - Todo → In Progress → Done
   - Use `gh project` commands or drag-and-drop in the UI
   - Example: `gh project item-move <item-id> --to "In Progress"`

3. **Link PRs to issues:**
   - In PR description, use "Fixes #N" or "Closes #N"
   - This automatically closes the issue and moves it to Done

## Rules

- Every piece of planned work has an issue. No work without an issue.
- Issues are self-contained. Another agent should be able to pick up the issue and implement it without asking questions.
- Agents update issue status as they work: move to corresponding project column
- Blocked issues state what they're blocked by in the issue body
- Acceptance criteria are concrete and testable. "It works" is not a criterion.
- PRs reference their issue number in the description
- Commits reference their issue ID: `feat(ui): add signal runtime (#123)`

## Issue Format

```markdown
## Description

What to implement. Reference design doc and implementation plan sections.

## Acceptance Criteria

- [ ] Concrete criterion 1
- [ ] Concrete criterion 2
- [ ] Integration test: <specific test description>
- [ ] Type flow: <.test-d.ts requirement if applicable>

## Progress

- YYYY-MM-DD: <update>
```

## Project Columns

- **Todo:** Work ready to be picked up
- **In Progress:** Currently being worked on
- **Done:** Completed, awaiting merge or already merged

## Commands

```bash
# Add item to project
gh project item-add 2 --url https://github.com/vertz-dev/vertz/issues/123

# Move item to column
gh project item-move 2 --field "Status" --value "In Progress"

# List project items
gh project item-list 2
```
