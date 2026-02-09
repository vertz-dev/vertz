# Commit Conventions

## Linear Ticket Reference

Every commit MUST reference its Linear ticket. Before committing, ask the user for the ticket ID if you don't have it.

Include the ticket identifier in the commit subject line in brackets:

```
feat(compiler): add moduleName to SchemaIR [VER-55]
```

Format: `<type>(<scope>): <description> [<TICKET-ID>]`

The ticket ID goes at the end of the subject line, inside square brackets. This makes tickets discoverable from `git log --oneline`.

If the commit closes the ticket, also include `Closes <TICKET-ID>` in the commit body.

## Never Use PR Numbers in Commits

Do NOT put GitHub PR numbers (e.g., `#114`) in commit messages. PR numbers are assigned by GitHub after the commit exists — they don't belong in commit history. Use Linear ticket IDs instead.

## Read Linear Ticket Before Starting Work

Before starting implementation on any phase or task:

1. **Ask the user for the Linear ticket ID** associated with the work
2. **Read the ticket** using `linear-mcp` or ask the user for context from the ticket
3. Use the ticket's description, acceptance criteria, and context to guide implementation
4. Reference the ticket ID in all commits for that work
