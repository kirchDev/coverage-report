# coverage-report README demo — rendered with VHS (https://github.com/charmbracelet/vhs)
#
# Regenerate (no local install needed beyond Docker):
#   pnpm install && pnpm build:npm && pnpm test:coverage
#   docker build -f .github/assets/vhs.Dockerfile -t coverage-report-vhs .
#   docker run --rm -v "$PWD:/vhs" coverage-report-vhs .github/assets/demo.tape
#
# The two host steps are what makes the demo real rather than staged: the tape
# reports on this repository's own coverage (`pnpm test:coverage` → coverage/
# lcov.info) with the compiled CLI (`pnpm build:npm` → lib/), and builds the
# pull request it measures from two pinned commits of this repository's history.
#
# The tape is the source of truth — edit the choreography below, re-render,
# commit the new GIF. Never hand-edit the GIF.

# Output MUST be a relative path — VHS rejects absolute paths like /vhs/...
Output .github/assets/demo.gif

Set FontSize 20
Set Width 1920
Set Height 360
Set Padding 16
# A canvas this wide can't sustain VHS's default 50fps capture: frames get
# dropped, playback speeds up, and the GIF ends up shorter than the sum of the
# Sleeps below. Capping the capture rate fixes it — lower it further if the
# rendered duration still runs short.
Set Framerate 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

# --- setup (hidden): a throwaway working directory holding this repository's own
#     lcov report, a Clover report to merge with it, and the diff of a pinned
#     twelve-commit range standing in for a pull request. The repository itself is
#     only ever read, so the working tree stays clean. ---
Hide
Type "mkdir -p /tmp/demo/coverage && cd /tmp/demo"
Enter
Type "cp /vhs/coverage/lcov.info coverage/lcov.info && cp /vhs/test/fixtures/sample.clover.xml coverage/clover.xml"
Enter
Type "git -C /vhs diff 2beedf1..ed86df6 -- src > pr.diff"
Enter
Type "alias coverage-report='node /vhs/lib/bin.js'"
Enter
Type "clear"
Enter
Sleep 1s
Show

Sleep 800ms

# --- two formats merged into one number, the diff mapped onto line hits ---
Type "coverage-report render coverage/lcov.info coverage/clover.xml --diff pr.diff"
Enter
Sleep 5s

# --- end on the report; no quit key, so VHS kills the shell for a clean last frame ---
Sleep 1.5s
