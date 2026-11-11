#!/bin/bash
# Double-click to start the AwaazSaathi demo server on this Mac.
cd "$HOME/Desktop/AwaazSaathi" || { echo "AwaazSaathi folder not found on the Desktop"; read -n 1; exit 1; }
# Keep the Mac awake at all times (also after Stop). To allow sleep again: restart the Mac, or run: pkill caffeinate
pgrep -x caffeinate >/dev/null || (nohup caffeinate -dis >/dev/null 2>&1 &)
echo "Starting AwaazSaathi... keep this window open during the demo."
./scripts/start.sh
