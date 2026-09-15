#!/usr/bin/env bash
# Deploy (or roll back to) a release tag on the production server.
#
#   sudo ./deploy.sh release-1.2.3
#
# Pulls the images, backs up the database, runs migrations, then swaps the app
# container. Migrations are additive, so rolling back is the same command with
# an older tag. Expects to run from /srv/deploy with a .env beside it.
set -euo pipefail
cd "$(dirname "$0")"

RELEASE="${1:?usage: deploy.sh release-X.Y.Z}"
set -a; source .env; set +a
export RELEASE
: "${ECR_IMAGE:?ECR_IMAGE missing from .env}"
: "${HOSTNAME:?HOSTNAME missing from .env}"

REGION="${AWS_REGION:-ap-south-1}"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ECR_IMAGE%%/*}"

docker compose pull app tools
docker compose up -d sqld

# Back up before touching the schema — but only once there is data to back up.
if [ -f data/sqld/dbs/default/data ]; then
  ./backup.sh "pre-$RELEASE"
fi

docker compose run --rm tools db:migrate
docker compose up -d app caddy

for _ in $(seq 1 15); do
  if body=$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null); then
    echo "$body"
    echo "deployed $RELEASE"
    exit 0
  fi
  sleep 2
done
echo "app did not become healthy; check: docker compose logs app" >&2
exit 1
