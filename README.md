# dgrid tickets

This orphan branch holds the dgrid issue tracker: a [br](https://github.com/Dicklesworthstone/beads_rust)
workspace in `.beads/`. It shares no history with `main`, so ticket changes never land on code branches.

Check it out once as a worktree at `~/src/worktrees/dgrid/tickets` and point br at it:

```bash
git worktree add ~/src/worktrees/dgrid/tickets tickets
export BEADS_DIR=~/src/worktrees/dgrid/tickets/.beads
```

br keeps its SQLite database (gitignored) in sync with `.beads/issues.jsonl`. Commit
`issues.jsonl` here whenever you want a checkpoint. Agents never commit on this branch.
