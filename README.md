# Kanban for Sero

Run an AI-assisted development board inside Sero.

With this plugin, you can:
- manage a project board directly inside Sero
- let the agent break work into planning, implementation, and review stages
- keep card state, PR state, and review state in sync with your workspace
- use the Kanban app, normal chat, `/kanban`, or terminal commands depending on how you like to work

This plugin is designed for **real software work**, not just task tracking. A
card can move from **Backlog → Planning → In Progress → Review → Done** while
Sero coordinates the underlying workflow.

## What you need

Before installing the plugin, make sure you have:

1. **Sero** installed
2. a **git-backed workspace** open in Sero
3. a **model selected in Sero** for planning / implementation / review work
4. **GitHub CLI (`gh`) authenticated** if you want PR creation, PR cancelation, or auto-merge flows

### Optional but recommended: GitHub CLI

If you want the review / PR flow to work fully, install and authenticate `gh`:

```bash
brew install gh
gh auth login
```

If `gh` is not configured, the board still works, but review actions that rely
on GitHub PRs will fail until auth is set up.

## Install the plugin

In **Sero → Admin → Plugins**, install:

```text
git:https://github.com/monobyte/sero-kanban-plugin.git
```

Sero will clone the repo, install dependencies, build it, and add **Kanban** to
your sidebar.

You can also install it from a local checkout:

```text
/absolute/path/to/sero-kanban-plugin
```

If you try to install this plugin on an older Sero build that does not support
plugin-owned background runtimes or plugin-owned CLI bridging, Sero should
block the install cleanly instead of letting it fail later at runtime.

## How the workflow feels in practice

The Kanban plugin is meant to make the board the source of truth for work.

A typical flow looks like this:

1. Create a card in **Backlog**
2. Start it to move it into **Planning**
3. Review and approve the plan
4. Let the agent execute the implementation
5. Review the result / PR / preview
6. Complete it into **Done**

Important mental model:

- **Use the board to drive work**
- once a card is started, the Kanban workflow owns the automation around that card
- the human’s role is usually to define the task, approve the plan, and make review decisions

In other words: don’t bypass the board and have the agent manually “just do the
task” if you want the Kanban workflow, state tracking, previews, and PR flow to
stay truthful.

## Everyday use

Once installed, you can use Kanban in four ways.

### 1) The Kanban app in Sero

This is the best place to:
- browse the board visually
- create and edit cards
- change board settings
- inspect planning / implementation / review progress
- request revisions or cancel a review PR
- see when a card is blocked, waiting, or complete

If your project supports preview/dev-server flows, review cards can also attach
preview state as part of the workflow.

### 2) Ask the agent in normal chat

You can ask for things like:

- “Show me the Kanban board”
- “Create a card for fixing the onboarding auth edge case”
- “Start card #3”
- “Approve the plan for #3”
- “Request revisions on #3 and ask for better test coverage”
- “What’s blocking card #7?”

### 3) Use `/kanban` in chat

The plugin also adds:

```text
/kanban
```

If you call `/kanban` with no arguments, it asks the system to list the board.
If you include text after it, Sero routes that instruction through the Kanban
workflow.

### 4) Use the terminal

The plugin owns the public `kanban` CLI bridge in Sero.

Start here:

```bash
sero help kanban
```

That will show the exact command syntax supported by your current Sero build.

A common command is:

```bash
sero kanban list
```

If you like terminal-first workflows, this gives you a direct way to inspect and
manage the same board the app UI uses.

## A good first run

After installing the plugin:

1. Open a git-backed workspace in Sero
2. Open the **Kanban** app
3. Create a small test card
4. Start the card
5. Wait for planning to finish
6. Approve the plan
7. Let implementation + review run
8. If a PR is created, inspect it and either:
   - complete the card
   - request revisions
   - cancel the PR

If everything is working, you should see the board update as the workflow moves
forward.

## Board settings

The Kanban plugin exposes a few important runtime-backed settings.

### YOLO Mode

Turns on the most aggressive automation path:
- auto-start
- auto-approve
- auto-complete with no human gates

Use this only if you intentionally want a high-autonomy workflow.

### PR Auto-Merge

When **YOLO Mode** is enabled, the plugin can also queue GitHub auto-merge for
new review PRs.

### Testing Enabled

Controls whether the workflow behaves like:
- **Production mode** — testing / TDD behavior on
- **Prototype mode** — testing disabled

### Review Mode

- **Full** — standard review flow
- **Light** — available only when testing is disabled

## Workspaces and state

Kanban is **workspace-scoped**.

That means each workspace gets its own board and workflow state. In Sero, the
board state lives under:

```text
<workspace>/.sero/apps/kanban/state.json
```

Related runtime files may also appear under the same `.sero/apps/kanban/`
folder, such as error logs and review artifacts.

You usually do **not** need to edit these files manually.

## Troubleshooting

### “Planner failed: No model selected.”

Sero does not currently have a model selected for that session/profile.

Fix:
- choose a model in Sero
- then retry the card

### PR or review actions fail

Most often, `gh` is not authenticated.

Fix:

```bash
gh auth login
```

Then retry the review/card action.

### The plugin is installed, but workflow actions do nothing useful

Check the basics:
- is the workspace a git repo?
- is a model selected?
- does the project have normal commands/tests/dev-server behavior Sero can detect?

### State file errors or unreadable board state

If the board state file becomes corrupted, the plugin will fail closed rather
than silently overwriting it.

Fix:
- inspect or repair files under `.sero/apps/kanban/`
- if needed, remove the malformed state/error file and let the plugin recreate it

## For Pi users

You can also install this as a Pi package:

```bash
pi install git:https://github.com/monobyte/sero-kanban-plugin.git
```

That exposes:
- the `kanban` tool
- the `/kanban` command

## Development

If you are working on the plugin itself:

```bash
npm install
npm test
npm run typecheck
npm run build
```

`pnpm` works too if you prefer it.
