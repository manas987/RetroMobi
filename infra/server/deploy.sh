#!/usr/bin/env bash
# Deploys one commit of the release branch on the VM with rootless Docker (as the
# ordinary user that owns the checkout; no sudo): check it out, build, migrate,
# restart, and wait for /api/health.
#
#   git -C ~/retromobi fetch origin && ~/retromobi/infra/server/deploy.sh "$(git -C ~/retromobi rev-parse origin/main)"
#
# Only full commit hashes already on origin/$DEPLOY_BRANCH (default main) are
# accepted. Rollback = run it with an older commit (migrations are not reversed).

# One block so bash parses it all before running: the checkout may replace this file.
{
set -euo pipefail

branch="${DEPLOY_BRANCH:-main}"
sha="${1:-${SSH_ORIGINAL_COMMAND:-}}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: deploy.sh <full 40-character commit hash on $branch>" >&2
  exit 2
fi
if [[ "$(id -u)" == "0" ]]; then
  echo "refusing to run as root: deploy as the user that runs rootless Docker" >&2
  exit 4
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$XDG_RUNTIME_DIR/docker.sock}"

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# BACKEND_PORT / FRONTEND_PORT, the same file docker compose reads.
if [[ -f "$server_dir/.env" ]]; then set -a; . "$server_dir/.env"; set +a; fi
cd "$server_dir/../.."

exec 9>"$XDG_RUNTIME_DIR/retromobi-deploy.lock"
if ! flock -n 9; then
  echo "another deploy is running" >&2
  exit 75
fi

git fetch --quiet origin "$branch"
if ! git merge-base --is-ancestor "$sha" "origin/$branch"; then
  echo "refusing: $sha is not on origin/$branch" >&2
  exit 3
fi
previous="$(git rev-parse HEAD)"
git checkout --quiet --detach "$sha"
echo "deploying $sha (previous: $previous)"

cd infra/server
docker compose build
# Migrations are additive, so the running containers keep working while they apply.
docker compose --profile tools run --rm migrate
docker compose up -d

echo "waiting for /api/health and the frontend"
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:${BACKEND_PORT:-3201}/api/health > /dev/null 2>&1 \
     && curl -fsS -o /dev/null http://127.0.0.1:${FRONTEND_PORT:-5180}/; then
    docker image prune -f > /dev/null
    docker builder prune -f --filter until=168h > /dev/null
    docker compose ps
    echo "deployed $sha"
    exit 0
  fi
  sleep 3
done

docker compose ps
docker compose logs --tail 50 backend frontend
echo "not healthy; to roll back run: infra/server/deploy.sh $previous" >&2
exit 1
}
