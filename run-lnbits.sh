#!/bin/sh
# Start the local development LNbits (fake funding source) on 127.0.0.1:5001.
# LNbits resolves its static files relative to the working directory, so run it from site-packages.
cd "$(dirname "$0")" && set -a && . ./lnbits.env && set +a
cd "$HOME/.local/lnbits-venv/lib/python3.12/site-packages" || exit 1
exec "$HOME/.local/lnbits-venv/bin/lnbits" --host "$HOST" --port "$PORT"
