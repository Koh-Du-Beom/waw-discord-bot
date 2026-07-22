#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

IMAGE="caddy:2.11.4-alpine"
PREFIX="waw-caddy-https-spike"
RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
CONTAINER="$PREFIX-$RUN_ID"
TMP="$(mktemp -d /tmp/waw-caddy-https-spike.XXXXXX)"
BACKEND_PID=""
IMAGE_EXISTED=0
HTTP_PORT=18080
HTTPS_PORT=18443

cleanup() {
  status=$?
  trap - ERR
  set +e
  docker rm -f "$CONTAINER" >/dev/null 2>&1
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1
    wait "$BACKEND_PID" >/dev/null 2>&1
  fi
  rm -rf -- "$TMP"
  if [[ $IMAGE_EXISTED -eq 0 ]]; then
    docker image rm "$IMAGE" >/dev/null 2>&1
  fi
  container_count="$(docker ps -a --filter "name=^/${PREFIX}-" --format '{{.Names}}' 2>/dev/null | wc -l | tr -d '[:space:]')"
  temp_count="$(find /tmp -maxdepth 1 -type d -name 'waw-caddy-https-spike.*' 2>/dev/null | wc -l | tr -d '[:space:]')"
  printf 'cleanup_container_count=%s\ncleanup_temp_count=%s\n' "$container_count" "$temp_count"
  exit "$status"
}
trap cleanup EXIT
trap 'printf "spike_error_line=%s\n" "$LINENO" >&2' ERR

for command in curl docker node sed; do
  command -v "$command" >/dev/null || { echo "missing_command=$command" >&2; exit 1; }
done
docker info >/dev/null
[[ "$(docker ps -a --filter "name=^/${PREFIX}-" --format '{{.Names}}' | wc -l | tr -d '[:space:]')" == 0 ]]
! lsof -nP -iTCP:"$HTTP_PORT" -sTCP:LISTEN >/dev/null 2>&1
! lsof -nP -iTCP:"$HTTPS_PORT" -sTCP:LISTEN >/dev/null 2>&1
docker image inspect "$IMAGE" >/dev/null 2>&1 && IMAGE_EXISTED=1
docker pull "$IMAGE" >/dev/null

mkdir -p "$TMP/data" "$TMP/config" "$TMP/logs"
cat >"$TMP/backend.mjs" <<'JS'
import http from 'node:http';
const server = http.createServer((request, response) => {
  if (request.url?.startsWith('/health')) {
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({
      status: 'healthy',
      host: request.headers.host,
      forwardedProto: request.headers['x-forwarded-proto'],
      forwardedHost: request.headers['x-forwarded-host']
    }));
    return;
  }
  response.writeHead(404).end();
});
server.listen(19080, '127.0.0.1');
JS
node "$TMP/backend.mjs" >"$TMP/backend.stdout" 2>"$TMP/backend.stderr" &
BACKEND_PID=$!
for _ in $(seq 1 20); do
  curl --noproxy '*' --fail --silent http://127.0.0.1:19080/health >/dev/null 2>&1 && break
  sleep 0.1
done
curl --noproxy '*' --fail --silent http://127.0.0.1:19080/health >/dev/null

cat >"$TMP/Caddyfile" <<'CADDY'
{
  admin 127.0.0.1:2019
}

http://waw-spike.invalid:8080 {
  redir https://waw-spike.invalid:18443{uri} permanent
}

https://waw-spike.invalid:8443 {
  tls internal
  log {
    output file /logs/access.json {
      mode 0600
      roll_disabled
    }
    format filter {
      request>uri query {
        replace code REDACTED
        replace state REDACTED
      }
      wrap json
    }
  }
  header X-Spike-Version v1
  reverse_proxy host.docker.internal:19080
}
CADDY

docker run --rm -v "$TMP/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile >/dev/null
cat >"$TMP/Caddyfile.invalid" <<'CADDY'
this is not a valid Caddyfile {
CADDY
if docker run --rm -v "$TMP/Caddyfile.invalid:/etc/caddy/Caddyfile:ro" "$IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo invalid_config_unexpectedly_passed >&2
  exit 1
fi
echo config_validation_passed

docker run -d --name "$CONTAINER" \
  --add-host host.docker.internal:host-gateway \
  -p "127.0.0.1:${HTTP_PORT}:8080" -p "127.0.0.1:${HTTPS_PORT}:8443" \
  -v "$TMP/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$TMP/data:/data" -v "$TMP/config:/config" -v "$TMP/logs:/logs" \
  "$IMAGE" >/dev/null

ROOT_CERT="$TMP/data/caddy/pki/authorities/local/root.crt"
for _ in $(seq 1 100); do
  [[ -s "$ROOT_CERT" ]] && curl --noproxy '*' --fail --silent --cacert "$ROOT_CERT" \
    --resolve "waw-spike.invalid:${HTTPS_PORT}:127.0.0.1" \
    "https://waw-spike.invalid:${HTTPS_PORT}/health" >/dev/null 2>&1 && break
  sleep 0.1
done
[[ -s "$ROOT_CERT" ]]

redirect_result="$(curl --noproxy '*' --silent --show-error --output /dev/null \
  --write-out '%{http_code} %{redirect_url}' \
  --resolve "waw-spike.invalid:${HTTP_PORT}:127.0.0.1" \
  "http://waw-spike.invalid:${HTTP_PORT}/health")"
[[ "$redirect_result" == "308 https://waw-spike.invalid:${HTTPS_PORT}/health" ]]
echo http_redirect_passed

health="$(curl --noproxy '*' --fail --silent --cacert "$ROOT_CERT" \
  --resolve "waw-spike.invalid:${HTTPS_PORT}:127.0.0.1" \
  "https://waw-spike.invalid:${HTTPS_PORT}/health")"
node -e 'const v=JSON.parse(process.argv[1]); if(v.status!=="healthy"||v.host!=="waw-spike.invalid:18443"||v.forwardedProto!=="https"||v.forwardedHost!=="waw-spike.invalid:18443") process.exit(1)' "$health"
echo proxy_header_boundary_passed

if curl --noproxy '*' --fail --silent --cacert "$ROOT_CERT" \
  --resolve "wrong.invalid:${HTTPS_PORT}:127.0.0.1" \
  "https://wrong.invalid:${HTTPS_PORT}/health" >/dev/null 2>&1; then
  echo wrong_hostname_unexpectedly_passed >&2
  exit 1
fi
echo wrong_hostname_denied

curl --noproxy '*' --fail --silent --cacert "$ROOT_CERT" \
  --resolve "waw-spike.invalid:${HTTPS_PORT}:127.0.0.1" \
  -H 'Authorization: Bearer SYNTHETIC_AUTH_FIXTURE' \
  -H 'Cookie: session=SYNTHETIC_COOKIE_FIXTURE' \
  "https://waw-spike.invalid:${HTTPS_PORT}/health?code=SYNTHETIC_CODE_FIXTURE&state=SYNTHETIC_STATE_FIXTURE" >/dev/null
for _ in $(seq 1 20); do
  grep -q REDACTED "$TMP/logs/access.json" 2>/dev/null && break
  sleep 0.1
done
! grep -Eq 'SYNTHETIC_(AUTH|COOKIE|CODE|STATE)_FIXTURE' "$TMP/logs/access.json"
grep -q REDACTED "$TMP/logs/access.json"
echo sensitive_log_redaction_passed

container_pid_before="$(docker inspect --format '{{.State.Pid}}' "$CONTAINER")"
sed 's/X-Spike-Version v1/X-Spike-Version v2/' "$TMP/Caddyfile" >"$TMP/Caddyfile.next"
cp "$TMP/Caddyfile.next" "$TMP/Caddyfile"
rm -f "$TMP/Caddyfile.next"
docker exec "$CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null
docker exec "$CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null
container_pid_after="$(docker inspect --format '{{.State.Pid}}' "$CONTAINER")"
[[ "$container_pid_after" == "$container_pid_before" ]]
response_headers="$(curl --noproxy '*' --fail --silent --cacert "$ROOT_CERT" --dump-header - --output /dev/null \
  --resolve "waw-spike.invalid:${HTTPS_PORT}:127.0.0.1" \
  "https://waw-spike.invalid:${HTTPS_PORT}/health")"
grep -qi '^X-Spike-Version: v2' <<<"$response_headers"
echo graceful_reload_passed

rss_kib="$(docker exec "$CONTAINER" awk '/VmRSS:/ {print $2}' /proc/1/status)"
[[ "$rss_kib" =~ ^[0-9]+$ ]]
(( rss_kib < 98304 ))
printf 'caddy_rss_kib=%s\n' "$rss_kib"
echo caddy_https_ingress_spike_passed
