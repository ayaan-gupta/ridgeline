#!/bin/sh
set -e
echo "Preparing replay data"
python fetch_replay_data.py || echo "Replay preparation reported a problem, continuing"
echo "Starting the ingestion worker"
exec python worker.py
