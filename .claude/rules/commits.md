# Commit Conventions

## GitHub Issue Reference

Every commit MUST reference its GitHub issue. Before committing, ask the user for the issue number if you don't have it.

Include the issue identifier in the commit subject line in brackets:

```
feat(compiler): add moduleName to SchemaIR [#55]
```

Format: `<type>(<scope>): <description> [#<ISSUE-NUMBER>]`

The issue number goes at the end of the subject line, inside square brackets. This makes issues discoverable from `git log --oneline`.

If the commit closes the issue, also include `Closes #<ISSUE-NUMBER>` in the commit body.

## Read GitHub Issue Before Starting Work

Before starting implementation on any phase or task:

1. **Ask the user for the GitHub issue number** associated with the work
2. **Read the issue** using `gh issue view <number>` or ask the user for context from the issue
3. Use the issue's description, acceptance criteria, and context to guide implementation
4. Reference the issue number in all commits for that work
