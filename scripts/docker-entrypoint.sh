#!/bin/sh
set -eu

data_dir="${ALT_QR_DATA_DIR:-/app/.alt-qr-data}"
mkdir -p "$data_dir"
chown altqr:altqr "$data_dir"

exec runuser --user altqr --preserve-environment -- "$@"
