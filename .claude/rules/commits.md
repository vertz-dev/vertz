# Commit Conventions

## Linear Ticket Reference

When a commit is associated with a Linear ticket, include the ticket identifier in the commit subject line in brackets:

```
feat(compiler): add moduleName to SchemaIR [VER-55]
```

Format: `<type>(<scope>): <description> [<TICKET-ID>]`

The ticket ID goes at the end of the subject line, inside square brackets. This makes tickets discoverable from `git log --oneline`.

If the commit closes the ticket, also include `Closes <TICKET-ID>` in the commit body.
