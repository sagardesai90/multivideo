# Dataset Overview

This directory contains structured sample data used for testing multi-angle streaming orchestration.
The data has been automatically generated to resemble a real-world content catalog, with each JSON file
representing either a provider contract, scheduled event, or curated playlist.

## Contents

- `providers/`: Partner distribution and ingest contracts.
- `events/`: Notional live events linked to providers.
- `playlists/`: Rotating editorial collections referencing the events.

Each file is intentionally small so tests can load them quickly. Values are plausible but synthetic.
