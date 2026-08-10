#!/usr/bin/env bash
set -euo pipefail

# Sequentially download BioC-PMC tar.gz files from NCBI.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

URLS=(
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC000XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC030XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC035XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC040XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC045XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC050XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC055XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC060XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC065XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC070XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC075XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC080XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC085XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC090XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC095XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC100XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC105XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC110XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC115XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC120XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC125XXXXX_json_unicode.tar.gz"
  "https://ftp.ncbi.nlm.nih.gov/pub/wilbur/BioC-PMC/PMC130XXXXX_json_unicode.tar.gz"
)

for URL in "${URLS[@]}"; do
  echo "Downloading $URL ..."
  if command -v wget >/dev/null 2>&1; then
    wget --continue --directory-prefix="$SCRIPT_DIR" "$URL"
  elif command -v curl >/dev/null 2>&1; then
    curl --fail --location --continue-at - --output-dir "$SCRIPT_DIR" --remote-name "$URL"
  else
    echo "Install wget or curl, then run this script again." >&2
    exit 1
  fi
done

echo "All downloads have finished!"
