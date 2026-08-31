# VHS image for rendering the README demo GIF, fully headless.
#
# Build:  docker build -f .github/assets/vhs.Dockerfile -t coverage-report-vhs .
# Render: docker run --rm -v "$PWD:/vhs" coverage-report-vhs .github/assets/demo.tape
#
# The official VHS image renders without a TTY/Homebrew/OBS — ideal for CI and
# WSL/root environments. It ships ffmpeg, but neither Node nor git, and this demo
# needs both: the CLI is plain Node (citty, no Bun), and the tape builds the
# pull-request diff it reports on from this repository's own history.
FROM ghcr.io/charmbracelet/vhs

ARG NODE_VERSION=24.12.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
  && rm -rf /var/lib/apt/lists/*

# The engines field says Node >= 24, so the image gets the same major the repo
# pins in .nvmrc — installed from the official tarball rather than Debian's
# archive, which is several majors behind.
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
  | tar -xJ -C /usr/local --strip-components=1 --exclude CHANGELOG.md --exclude README.md --exclude LICENSE
