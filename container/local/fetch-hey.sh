#!/usr/bin/env bash
# Download the pinned HEY CLI release into container/local/hey for the agent image.
# The binary is not committed (37 MB, built and published by Basecamp under MIT).
# Bump HEY_VERSION and both checksums together, from the release's checksums.txt.
set -euo pipefail

HEY_VERSION=1.13.1
declare -A SHA256=(
  [arm64]=a364f7a5292c96cc91a090c4ec073b0a1a532d6d91d06ddd84c7ad34e69a872b
  [amd64]=4914cf865d8427d395fd6b5fefd030710d54f7961087af0ba90f0f5c283fd012
)

case "$(uname -m)" in
  aarch64 | arm64) arch=arm64 ;;
  x86_64 | amd64) arch=amd64 ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

here="$(cd "$(dirname "$0")" && pwd)"
tarball="hey_${HEY_VERSION}_linux_${arch}.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL -o "$tmp/$tarball" \
  "https://github.com/basecamp/hey-cli/releases/download/v${HEY_VERSION}/${tarball}"
echo "${SHA256[$arch]}  $tmp/$tarball" | sha256sum -c - >/dev/null
tar -xzf "$tmp/$tarball" -C "$tmp" hey
install -m 0755 "$tmp/hey" "$here/hey"
echo "container/local/hey: HEY CLI ${HEY_VERSION} (${arch})"
