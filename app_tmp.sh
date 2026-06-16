#!/bin/bash
# Domino app launcher for the tempdir / disk-space diagnostic.
# Domino apps must bind 0.0.0.0:8888.
set -euo pipefail

# Run from this script's own directory so the module path resolves
# regardless of where Domino invokes app.sh from.
cd "$(dirname "$0")"

exec uvicorn tempdir_diskcheck:app --host 0.0.0.0 --port 8888
