#!/usr/bin/env python3
"""Generate rich sample data for multivideo experiments."""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
PROVIDERS_DIR = DATA_ROOT / "providers"
EVENTS_DIR = DATA_ROOT / "events"
PLAYLISTS_DIR = DATA_ROOT / "playlists"
DOCS_DIR = ROOT / "docs" / "datasets"

random.seed(42)

SPORTS = [
    "premier-league",
    "la-liga",
    "nba",
    "f1",
    "nfl",
    "mls",
    "champions-league",
    "rugby-championship",
    "cricket-world-series",
    "mma",
    "boxing",
    "tennis-tour",
    "golf-tour",
    "cycling-world-tour",
    "esports-league"
]

COUNTRIES = [
    "us",
    "uk",
    "de",
    "fr",
    "es",
    "it",
    "ca",
    "mx",
    "br",
    "au",
    "nz",
    "jp",
    "kr",
    "sg",
    "za"
]

LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ja",
    "ko",
    "zh",
    "ar",
    "hi"
]

CDNS = [
    "akamai",
    "cloudfront",
    "fastly",
    "cloudflare",
    "limelight"
]

PROTOCOLS = [
    ("hls", "m3u8"),
    ("dash", "mpd"),
    ("webrtc", "sdp")
]

PREFIXES = [
    "Global",
    "Velocity",
    "Summit",
    "Edge",
    "Continental",
    "Metro",
    "AllStar",
    "Ultra",
    "Vantage",
    "Prime",
    "Aurora",
    "Pulse",
    "Optimum",
    "Voyager",
    "Auric"
]

REGIONAL_DESCRIPTORS = [
    "Atlantic",
    "Pacific",
    "Central",
    "Nordic",
    "Iberian",
    "Balkan",
    "Alpine",
    "Andean",
    "Transatlantic",
    "Coastal",
    "Steppe",
    "Cascadia",
    "Sahara",
    "Baltic",
    "Panamerican"
]

SUFFIXES = [
    "Sports Network",
    "Streaming Cooperative",
    "Broadcast Exchange",
    "Media Collective",
    "Play Signals",
    "Multi-View",
    "Interactive",
    "Arena",
    "Digital Hub",
    "League Pass"
]

EVENT_NAME_SETS = {
    "premier-league": [
        "Matchweek Clash",
        "Derby Showdown",
        "Top Four Battle"
    ],
    "la-liga": [
        "Iberian Classic",
        "Catalan Fixture",
        "Madrid Derby"
    ],
    "nba": [
        "Conference Spotlight",
        "Marquee Matchup",
        "Playoff Preview"
    ],
    "f1": [
        "Grand Prix Qualifying",
        "Night Race Sprint",
        "Circuit Practice"
    ],
    "nfl": [
        "Primetime Fixture",
        "Division Decider",
        "Wildcard Chase"
    ],
    "mls": [
        "Derby Day",
        "Conference Battle",
        "Expansion Showcase"
    ],
    "champions-league": [
        "Group Stage Spotlight",
        "Knockout Thriller",
        "Final Rehearsal"
    ],
    "rugby-championship": [
        "Southern Hemisphere Test",
        "Tri-Nations Classic",
        "Rivalry Cup"
    ],
    "cricket-world-series": [
        "Day/Night ODI",
        "Test Match Session",
        "T20 Showcase"
    ],
    "mma": [
        "Title Eliminator",
        "Fight Night",
        "Contender Series"
    ],
    "boxing": [
        "Main Event Bout",
        "Undercard Showcase",
        "Title Defense"
    ],
    "tennis-tour": [
        "Masters Quarterfinal",
        "Grand Slam Warmup",
        "Doubles Spotlight"
    ],
    "golf-tour": [
        "Links Challenge",
        "Championship Round",
        "Ryder Preview"
    ],
    "cycling-world-tour": [
        "Mountain Stage",
        "Time Trial",
        "Sprint Finish"
    ],
    "esports-league": [
        "LAN Finale",
        "Regional Semifinal",
        "Showmatch"
    ]
}
def create_directories() -> None:
    for directory in [PROVIDERS_DIR, EVENTS_DIR, PLAYLISTS_DIR, DOCS_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def format_timestamp(days_in_future: int, hour: int) -> str:
    base = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    target = base + timedelta(days=days_in_future)
    return target.replace(hour=hour).isoformat() + "Z"


def generate_providers(count: int = 60) -> List[Dict[str, Any]]:
    providers: List[Dict[str, Any]] = []
    seen_names = set()

    for idx in range(1, count + 1):
        prefix = random.choice(PREFIXES)
        region = random.choice(REGIONAL_DESCRIPTORS)
        suffix = random.choice(SUFFIXES)
        name_candidate = f"{prefix} {region} {suffix}"
        while name_candidate in seen_names:
            prefix = random.choice(PREFIXES)
            region = random.choice(REGIONAL_DESCRIPTORS)
            suffix = random.choice(SUFFIXES)
            name_candidate = f"{prefix} {region} {suffix}"
        seen_names.add(name_candidate)

        provider_id = f"provider-{idx:03d}"
        focus_count = random.randint(2, 5)
        focus = random.sample(SPORTS, focus_count)
        countries = random.sample(COUNTRIES, random.randint(2, 5))
        languages = random.sample(LANGUAGES, random.randint(1, 3))
        cdn = random.choice(CDNS)

        endpoints = []
        for protocol, extension in random.sample(PROTOCOLS, random.randint(1, len(PROTOCOLS))):
            stream_key = f"{provider_id}-{protocol}"
            endpoints.append(
                {
                    "protocol": protocol,
                    "url": f"https://streams.example.com/{provider_id}/{protocol}/master.{extension}",
                    "auth": {
                        "type": random.choice(["signed-url", "token", "mutual-tls"]),
                        "ttlSeconds": random.choice([900, 1800, 3600]),
                    },
                    "ingest": {
                        "region": random.choice(countries),
                        "latencyClass": random.choice(["ultra-low", "low", "standard"]),
                    },
                    "monitoring": {
                        "healthcheck": f"https://status.example.com/{provider_id}/{protocol}",
                        "observability": random.choice(["newrelic", "datadog", "grafana"]),
                    },
                    "streamKey": stream_key,
                }
            )

        support = {
            "statusPage": f"https://status.example.com/{provider_id}",
            "contact": f"support@{provider_id}.example.com",
            "onCall": random.choice(["follow-the-sun", "regional-escalation", "hybrid"]),
        }

        providers.append(
            {
                "id": provider_id,
                "name": name_candidate,
                "focus": sorted(focus),
                "countries": sorted(countries),
                "languages": sorted(languages),
                "cdn": cdn,
                "endpoints": endpoints,
                "support": support,
            }
        )
    return providers


def generate_events(providers: List[Dict[str, Any]], count: int = 90) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for idx in range(1, count + 1):
        sport = random.choice(SPORTS)
        titles = EVENT_NAME_SETS[sport]
        descriptor = random.choice(titles)
        event_id = f"event-{idx:03d}-{sport}"
        start_hour = random.choice([12, 15, 18, 20, 22])
        day_offset = random.randint(1, 90)
        duration = random.choice([2, 3, 4])
        end_hour_total = start_hour + duration
        end_day_offset = day_offset + end_hour_total // 24
        end_hour = end_hour_total % 24
        start = format_timestamp(days_in_future=day_offset, hour=start_hour)
        end = format_timestamp(days_in_future=end_day_offset, hour=end_hour)
        venue = random.choice([
            "Metropolitan Arena",
            "Coastal Dome",
            "Summit Stadium",
            "Heritage Park",
            "Aurora Center",
            "Prime Pavilion",
            "Velocity Arena",
            "Union Ground",
            "Liberty Field",
            "Grand Prix Circuit"
        ])
        timezone = random.choice(["UTC", "America/New_York", "Europe/London", "Asia/Singapore", "Australia/Sydney"])
        providers_sample = random.sample(providers, k=random.randint(2, 4))
        providers_ids = [provider["id"] for provider in providers_sample]
        notes = [
            random.choice([
                "4K SDR primary feed",
                "Dolby Atmos mix available",
                "Alternate commentary lane",
                "Player-specific iso cams",
                "Enhanced data overlays enabled",
                "VR companion experience",
            ])
            for _ in range(random.randint(2, 4))
        ]
        events.append(
            {
                "id": event_id,
                "sport": sport,
                "title": f"{sport.replace('-', ' ').title()} {descriptor}",
                "start": start,
                "end": end,
                "venue": venue,
                "timezone": timezone,
                "providers": providers_ids,
                "notes": notes,
            }
        )
    return events


def generate_playlists(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    playlists: List[Dict[str, Any]] = []
    events_by_sport: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        events_by_sport.setdefault(event["sport"], []).append(event)

    playlist_idx = 1
    for sport, sport_events in events_by_sport.items():
        random.shuffle(sport_events)
        chunks = [sport_events[i : i + 5] for i in range(0, len(sport_events), 5)]
        for chunk in chunks:
            playlist_id = f"playlist-{playlist_idx:03d}-{sport}"
            playlist_idx += 1
            title = f"{sport.replace('-', ' ').title()} Weekly Mix #{playlist_idx:02d}"
            curator = random.choice([
                "editorial-team",
                "automation-playbook",
                "regional-scouts",
                "audience-growth"
            ])
            weeks = [f"2025-W{random.randint(1, 52):02d}" for _ in range(random.randint(2, 4))]
            playlists.append(
                {
                    "id": playlist_id,
                    "sport": sport,
                    "title": title,
                    "curator": curator,
                    "weeks": sorted(set(weeks)),
                    "events": [event["id"] for event in chunk],
                }
            )
    return playlists


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def write_providers(providers: List[Dict[str, Any]]) -> None:
    for provider in providers:
        write_json(
            PROVIDERS_DIR / f"{provider['id']}.json",
            {
                "id": provider["id"],
                "name": provider["name"],
                "sportsFocus": provider["focus"],
                "coverageCountries": provider["countries"],
                "supportedLanguages": provider["languages"],
                "primaryCdn": provider["cdn"],
                "activeEndpoints": provider["endpoints"],
                "supportModel": provider["support"],
            },
        )


def write_events(events: List[Dict[str, Any]]) -> None:
    for event in events:
        write_json(
            EVENTS_DIR / f"{event['id']}.json",
            {
                "id": event["id"],
                "sport": event["sport"],
                "title": event["title"],
                "window": {
                    "start": event["start"],
                    "end": event["end"],
                    "timezone": event["timezone"],
                },
                "venue": event["venue"],
                "availableProviders": event["providers"],
                "presentationNotes": event["notes"],
            },
        )


def write_playlists(playlists: List[Dict[str, Any]]) -> None:
    for playlist in playlists:
        write_json(
            PLAYLISTS_DIR / f"{playlist['id']}.json",
            {
                "id": playlist["id"],
                "sport": playlist["sport"],
                "title": playlist["title"],
                "curator": playlist["curator"],
                "targetWeeks": playlist["weeks"],
                "events": playlist["events"],
            },
        )


def write_docs(providers: List[Dict[str, Any]], events: List[Dict[str, Any]], playlists: List[Dict[str, Any]]) -> None:
    overview = DOCS_DIR / "README.md"
    overview.write_text(
        "# Dataset Overview\n\n"
        "This directory contains structured sample data used for testing multi-angle streaming orchestration.\n"
        "The data has been automatically generated to resemble a real-world content catalog, with each JSON file\n"
        "representing either a provider contract, scheduled event, or curated playlist.\n\n"
        "## Contents\n\n"
        "- `providers/`: Partner distribution and ingest contracts.\n"
        "- `events/`: Notional live events linked to providers.\n"
        "- `playlists/`: Rotating editorial collections referencing the events.\n\n"
        "Each file is intentionally small so tests can load them quickly. Values are plausible but synthetic.\n"
    )

    providers_doc = DOCS_DIR / "providers.md"
    top_providers = sorted(providers, key=lambda p: len(p["focus"]), reverse=True)[:10]
    providers_lines = ["# Provider Highlights", ""]
    for provider in top_providers:
        providers_lines.append(f"## {provider['name']}")
        providers_lines.append("- Sports focus: " + ", ".join(provider["focus"]))
        providers_lines.append("- Coverage regions: " + ", ".join(provider["countries"]))
        providers_lines.append("- Languages: " + ", ".join(provider["languages"]))
        providers_lines.append("- Primary CDN: " + provider["cdn"])
        providers_lines.append("")
    providers_doc.write_text("\n".join(providers_lines) + "\n")

    quality_doc = DOCS_DIR / "validation-playbook.md"
    quality_doc.write_text(
        "# Data Validation Playbook\n\n"
        "Consumers of the dataset should validate cross references to ensure nothing falls out of sync.\n\n"
        "## Critical checks\n\n"
        "1. Every event must reference at least two providers.\n"
        "2. Playlists should only reference events that exist on disk.\n"
        "3. Providers must expose at least one ingest endpoint.\n"
        "4. Provider regions and languages should align with business requirements for the consuming feature.\n\n"
        "## Suggested automation\n\n"
        "- Run the `tests/data` suite for structural validation.\n"
        "- Add schema validation if new properties are added.\n"
        "- Sample a handful of files per run to ensure values remain plausible.\n"
    )


def main() -> None:
    create_directories()
    providers = generate_providers()
    events = generate_events(providers)
    playlists = generate_playlists(events)
    write_providers(providers)
    write_events(events)
    write_playlists(playlists)
    write_docs(providers, events, playlists)
    summary = {
        "providers": len(providers),
        "events": len(events),
        "playlists": len(playlists),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
