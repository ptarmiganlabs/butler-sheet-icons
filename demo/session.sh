#!/usr/bin/env bash
#
# The terminal session each recording captures: print the command line a user
# would type, then run exactly that command. The echoed line names the real
# invocation - nothing in the recorded output is synthesized.
#
# The prompt is pinned rather than inherited (issue #1001): a recording must
# never show the operator's own hostname or working directory. Since it is
# ours to choose, it carries the project's name.
#
# Runs inside the pty asciinema allocates, so the CLI sees a real TTY and
# renders colour, the run card and the live view exactly as it would for an
# operator.

set -euo pipefail

DEMO_PROMPT="${DEMO_PROMPT:-ptarmiganlabs@demo:~$}"

butler-sheet-icons() { node src/butler-sheet-icons.js "$@"; }

printf '%s butler-sheet-icons %s\n' "$DEMO_PROMPT" "$*"
butler-sheet-icons "$@"
