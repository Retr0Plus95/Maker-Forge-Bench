#!/usr/bin/env bash
# Runs every Maker Forge Bench check. Must end with "ALL CHECKS PASSED".
set -euo pipefail
cd "$(dirname "$0")"

echo "== dev.py tests"
python -m unittest discover -s tests/python

echo "ALL CHECKS PASSED"
