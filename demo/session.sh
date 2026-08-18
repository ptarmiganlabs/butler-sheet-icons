#!/usr/bin/env bash
#
# The terminal session each recording captures: print the command line a user
# would type, then run exactly that command. The echoed line names the real
# invocation - nothing in the recorded output is synthesized.
#
# Runs inside the pty asciinema allocates, so the CLI sees a real TTY and
# renders colour, the run card and the live view exactly as it would for an
# operator.

set -euo pipefail

butler-sheet-icons() { node src/butler-sheet-icons.js "$@"; }

printf '$ butler-sheet-icons %s\n' "$*"
butler-sheet-icons "$@"
