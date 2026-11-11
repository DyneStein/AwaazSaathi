#!/bin/bash
# Double-click to start the AwaazSaathi demo server on this Mac.
cd "$HOME/Desktop/AwaazSaathi" || { echo "AwaazSaathi folder not found on the Desktop"; read -n 1; exit 1; }
echo "Starting AwaazSaathi... keep this window open during the demo."
caffeinate -dis -w $$ &          # keep the Mac awake while this window is open
./scripts/start.sh
