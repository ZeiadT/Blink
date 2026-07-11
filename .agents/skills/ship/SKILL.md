---
name: ship
description: Use this skill ONLY when the user explicitly types the word "ship" or explicitly asks to trigger the ship skill. Do not trigger it under any other circumstances.
compatibility: github-mcp-server
---

# Ship Skill

The `ship` skill automates the tedious process of breaking down a massive set of local uncommitted and untracked files into logical chunks, committing them to separate branches, pushing those branches, creating Pull Requests, and automatically squash-merging them into the main branch.

## Workflow

When the user invokes this skill, follow these exact steps sequentially:

1. **Analyze Current State**: Run `git status` to see all modified and untracked files.
2. **Logical Grouping**: Group the files into logical categories (e.g., Core/Shared, specific UI components, specific backend features). 
   - Files that depend on each other or are conceptually related should go together. 
   - Core or shared dependencies should be in an earlier group so they get merged first.
3. **Determine Default Branch**: Find the default branch name (usually `master` or `main`) by running `git remote show origin` or observing the branch in `git status`.
4. **Iterative Batching**: For each logical group, perform the following in sequence:
   1. `git checkout <default-branch>`
   2. `git pull origin <default-branch>`
   3. `git checkout -b <group-branch-name>`
   4. `git add <file1> <file2> ...` (Add only the files for this specific group)
   5. `git commit -m "feat: <description of group>"`
   6. `git push -u origin <group-branch-name>`
   7. Call `call_mcp_tool` with `ServerName: github-mcp-server` and `ToolName: create_pull_request` to create a PR against the default branch.
   8. Call `call_mcp_tool` with `ServerName: github-mcp-server` and `ToolName: merge_pull_request` using `mergeMethod: "squash"`.
      - **CRITICAL**: If the merge fails (e.g., due to conflicts), DO NOT proceed to the next group. **Stop and ask the user** to resolve the conflicts or provide guidance before you continue.
   9. Once successfully merged, loop back to step 4.1 for the next group.

## Important Principles

- **No Ghost Commits**: When branching off the default branch, the uncommitted files belonging to other groups will remain safely in the working directory because they do not conflict with the pulled changes. Do not use `git reset --hard` as it will wipe out uncommitted files.
- **Dependency Ordering**: Order the groups so that foundational files are merged before features that rely on them.
- **Wait For Completion**: Git commands like `git push` might take a moment. Wait for them to finish before calling the GitHub MCP tools.
- **Handling PR Creation/Merge**: Make sure you have the owner and repo name correct. You can deduce them from `git remote -v`.
