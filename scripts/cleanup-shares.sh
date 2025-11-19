#!/bin/bash
# Cleanup old share links
#
# Usage: ./scripts/cleanup-shares.sh [options]
#
# Options:
#   --dry-run           Preview what would be deleted without actually deleting
#   --max-age DAYS      Maximum age in days (default: 30)
#   --max-inactive DAYS Maximum inactivity in days (default: 7)
#   --url URL           Base URL of the app (default: http://localhost:3000)
#
# Environment variables:
#   CLEANUP_AUTH_TOKEN  Authorization token (optional, for production)
#   APP_URL             Base URL of the app
#
# Cron examples:
#   # Run daily at 3am
#   0 3 * * * /path/to/scripts/cleanup-shares.sh >> /var/log/share-cleanup.log 2>&1
#
#   # Run weekly on Sunday at 2am
#   0 2 * * 0 /path/to/scripts/cleanup-shares.sh >> /var/log/share-cleanup.log 2>&1

set -e

# Default configuration
DRY_RUN=""
MAX_AGE_DAYS="30"
MAX_INACTIVE_DAYS="7"
BASE_URL="${APP_URL:-http://localhost:3000}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --max-age)
      MAX_AGE_DAYS="$2"
      shift 2
      ;;
    --max-inactive)
      MAX_INACTIVE_DAYS="$2"
      shift 2
      ;;
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Build URL
CLEANUP_URL="${BASE_URL}/api/share/cleanup?maxAgeDays=${MAX_AGE_DAYS}&maxInactiveDays=${MAX_INACTIVE_DAYS}"
if [ -n "$DRY_RUN" ]; then
  CLEANUP_URL="${CLEANUP_URL}&dryRun=true"
fi

# Build headers
HEADERS=""
if [ -n "$CLEANUP_AUTH_TOKEN" ]; then
  HEADERS="-H \"Authorization: Bearer ${CLEANUP_AUTH_TOKEN}\""
fi

echo "============================================"
echo "Share Link Cleanup"
echo "============================================"
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "URL: ${CLEANUP_URL}"
echo "Max Age: ${MAX_AGE_DAYS} days"
echo "Max Inactive: ${MAX_INACTIVE_DAYS} days"
echo "Dry Run: ${DRY_RUN:-false}"
echo "--------------------------------------------"

# Run cleanup
RESPONSE=$(curl -s -X POST ${HEADERS} "${CLEANUP_URL}")

# Check for errors
if echo "$RESPONSE" | grep -q '"error"'; then
  echo "ERROR: Cleanup failed"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

# Display results
echo "Results:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Extract key metrics for logging
REMOVED=$(echo "$RESPONSE" | jq -r '.result.removed // 0' 2>/dev/null || echo "?")
REMAINING=$(echo "$RESPONSE" | jq -r '.result.totalAfter // 0' 2>/dev/null || echo "?")

echo "--------------------------------------------"
echo "Summary: Removed ${REMOVED} entries, ${REMAINING} remaining"
echo "============================================"
