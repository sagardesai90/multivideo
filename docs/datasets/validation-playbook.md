# Data Validation Playbook

Consumers of the dataset should validate cross references to ensure nothing falls out of sync.

## Critical checks

1. Every event must reference at least two providers.
2. Playlists should only reference events that exist on disk.
3. Providers must expose at least one ingest endpoint.
4. Provider regions and languages should align with business requirements for the consuming feature.

## Suggested automation

- Run the `tests/data` suite for structural validation.
- Add schema validation if new properties are added.
- Sample a handful of files per run to ensure values remain plausible.
