# A closed output pipe, when the reader is another program rather than `head`

This extends something already on the doc site rather than describing anything new to an
administrator. It should be folded into the existing section, not published as a page of its own.

| |  |
| --- | --- |
| Target page | `docs/guide/advanced/crash-dumps.md` |
| Target section | **A closed output pipe is not a crash** (`#a-closed-output-pipe-is-not-a-crash`) |
| Draft this follows | `done/done_piping-output-to-head-or-less.md`, published as that section |

## What the published section says today

That Butler Sheet Icons treats a closed output pipe as an ordinary end to the run: no crash report,
nothing printed, exit code 141. The example is `... | head -12`.

That was true only when the reader was something like `head`. It was **not** true when the thing
reading the output was another program.

## What to add

Butler Sheet Icons is not always run by hand at a prompt. It is also started by wrapper scripts, job
runners and scheduling tools that capture its output and read it themselves. When one of those stops
reading early, the run should end the same quiet way — and until now it did not. It wrote a crash
report and exited with code 1, exactly the thing this section says no longer happens.

The reason is invisible from the outside: output captured by another program travels over a slightly
different kind of connection than output piped to `head`, and that kind reports its reader leaving
with a different message. Butler Sheet Icons now recognises both, so the promise the section already
makes holds however the output was being read.

Suggested wording, to follow the paragraph beginning "A closed output pipe is now treated as an
ordinary end to the run":

> This applies whether the reader is a command such as `head`, a pager you quit early, or **another
> program that started Butler Sheet Icons and captured its output** — a wrapper script, a job runner,
> or a scheduling tool. If you have seen occasional unexplained crash reports from a run driven by
> another tool, with `write ENOTCONN` or `write ECONNRESET` as the error message, that is what they
> were. Whether one appeared depended on timing, so they were most likely on a busy machine.

## One clarification worth adding to "Real failures are unaffected"

That subsection currently lists a full disk and a permission problem as things that still produce a
crash report. There is a fourth case that matters more to a Qlik Sense administrator and is worth
stating, because the two can look similar:

> - **A lost connection to Qlik Sense still produces a crash report.** A dropped server connection and
>   a reader that stopped reading can surface with the same error name. Butler Sheet Icons only takes
>   the quiet path when it knows the failure was its own output; anything else keeps its crash report
>   and exit code 1, which is what you need when a run against a Qlik Sense server fails halfway.

Nothing else in the section changes. The exit code is still 141, the `BSI_CRASH_DUMP_*` variables are
unchanged, and the `| head -12` example is still correct.

## Notes for the publishing pass

- The existing section carries `::: warning Requires BSI 5.0.0 or later`. If this change ships in
  5.0.0 as well, that warning already covers it and no second gate is needed — check the version on
  the open release-please pull request before publishing, rather than assuming.
- The **troubleshooting page** entry for this symptom needs no change: it describes the symptom, which
  is the same either way.
- The **exit code 141** entry on the commands reference needs no change either. 141 was already the
  code for this; the change is which situations reach it.
- Verified on macOS. A real shell pipe reports the reader leaving one way in every one of 30 runs;
  captured output intermittently reports it another way, and that case was still writing crash
  reports. Checked across 120 runs after the fix, including runs that took the intermittent path.
