# Interactive mode

Butler Sheet Icons can now ask you what it needs instead of expecting you to assemble a command line.

```bash
butler-sheet-icons interactive
```

You get a menu, a few questions, and — before anything happens — the exact command line your answers
correspond to. Nothing about the existing commands changes: every option still works exactly as before,
and automation is unaffected.

This first release covers the two browser commands. The Qlik Sense thumbnail commands, which have the
longest option lists and would benefit most, are planned for a later release.

## Why would I use it?

Three reasons, in rough order of how often they matter.

**You do not have to know what is installed.** `browser uninstall` used to require both `--browser` and
`--browser-version`, with the version typed exactly right, and nothing told you what was on the machine.
Now you pick from a list of the browsers actually in the cache:

```
? Which browser build should be removed?
❯ chrome  151.0.7922.47  (mac_arm)
  chrome  150.0.7871.24  (mac_arm)
```

**Mistakes are caught as you make them.** Each answer is checked against the same rule the command line
uses, with the same wording. Type a word where a number belongs and you are told immediately, rather than
after you have typed out the rest of the command.

**It teaches you the command line.** Before running anything, Butler Sheet Icons shows you what you just
built:

```
── Review ──────────────────────────────────────

  Equivalent command:
  butler-sheet-icons browser uninstall --browser-version 151.0.7922.47

? Ready?
❯ Run it
  Start over
  Cancel
```

That line is the real thing. Copy it into a scheduled task, a script, or a support ticket and it produces
exactly the same result. This is the intended path from *"I clicked through it once"* to *"it runs every
night"*.

Options you left at their default are left off the line, so what you see is the shortest command that
does what you asked.

## What can I do with it today?

| Wizard | What it replaces |
|---|---|
| **Install a browser into the cache** | `browser install` — pick from published versions by typing to filter, or take the recommended build |
| **Uninstall a browser from the cache** | `browser uninstall` — pick from what is actually installed |

Choose **Exit** to leave without doing anything. `Ctrl+C` at any point does the same — nothing is changed
unless you choose **Run it**.

### Browsers built for another platform

If your browser cache came from another machine — copied to prepare an offline server, shared over a
network drive, or mounted into a container — it can hold browsers built for a different operating system.
Those are shown, and labelled:

```
  chrome  151.0.7922.47  (built for win64 - cannot run here)
```

They remain selectable on purpose. A browser you cannot run is still taking up disk space, and removing
it is a perfectly reasonable thing to want.

## What happens when there is no terminal?

Interactive mode needs a terminal, and it checks before asking anything. If there is not one, it says so
and exits immediately with a non-zero exit code:

```
Interactive mode needs a terminal. Standard input is not a terminal - this happens with piped input,
cron, "docker run" without -it, and most CI runners. Re-run with the options on the command line, or
start the container with "docker run -it".
```

**It never waits for input that cannot arrive.** This matters: a command that blocks forever inside a
scheduled task is a far worse outcome than one that fails immediately with an explanation.

The same applies to terminals that cannot support prompting at all. PowerShell ISE, for example, has no
console behind it and cannot report keystrokes; Butler Sheet Icons detects this and refuses with guidance
rather than appearing to hang.

To run interactively in Docker, attach a terminal:

```bash
docker run -it ptarmiganlabs/butler-sheet-icons:latest interactive
```

## Can I turn it off?

Yes. Two environment variables control it, and both are useful in different situations.

| Variable | Effect |
|---|---|
| `BSI_NO_INTERACTIVE=1` | Refuse to prompt, even in a terminal |
| `BSI_ASCII_ONLY=1` | Use plain ASCII characters instead of Unicode symbols |

`BSI_NO_INTERACTIVE=1` is worth setting in an environment where prompting should never happen regardless
of how the command is launched — a shared build agent, for instance. Note that interactive mode is
deliberately **not** disabled just because a `CI` variable is present: plenty of people have that set in
an ordinary shell where prompting is perfectly fine.

`BSI_ASCII_ONLY=1` is for consoles that cannot render characters like `❯` and `─` and show them as
meaningless symbols instead. Butler Sheet Icons detects most such consoles automatically, but if yours
slips through, this forces the plain-text set:

```
  cursor        >
  done          [ok]
  failed        [!!]
```

## The wizard looks wrong on my server

There is a built-in diagnostic for exactly this:

```bash
butler-sheet-icons interactive --self-test
```

It reports what your terminal supports — whether it is a real terminal, whether colour is available, which
character set is in use, the console code page on Windows — then draws every symbol, border and colour it
would use, and finally shows one of each prompt type so you can see how they behave.

It changes nothing: no connection to Qlik Sense, no downloads, nothing written to disk. It is safe to run
anywhere, and pasting its output into a support issue is the fastest way to get a rendering problem
diagnosed.

If the output is being captured to a file rather than shown on screen, the prompt section is skipped and
the report still completes.

## Does this change how the commands themselves work?

No. Interactive mode is a front end that assembles options and then calls exactly the same code the
command line does. The options it produces are identical to the ones you would get by typing the flags
yourself — that equivalence is verified automatically for every command and every option.

The plain command line remains the supported way to run Butler Sheet Icons unattended, and nothing about
it has changed.
