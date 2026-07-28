#!/usr/bin/env bash
set -Eeuo pipefail
set +x

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib/bounded-lightsail-ssh.sh"
REMOTE="$SCRIPT_DIR/production-schema-failure-stage-remote.sh"
SCHEMA_RUNNER="$SCRIPT_DIR/check-production-schema-version.sh"
BACKUP_SCHEMA_RUNNER="$SCRIPT_DIR/check-production-schema-version-backup-role.sh"
PROVIDER_REMOTE_TEMPLATE="$SCRIPT_DIR/summary-provider-default-off-install-remote.sh"
PROVIDER_MANAGER="$SCRIPT_DIR/../deploy/manage-summary-provider-default-off.sh"
PROVIDER_SOURCE="$SCRIPT_DIR/../deploy/systemd/waw-summary-provider-default-off.conf"
EMBED_RENDERER="$SCRIPT_DIR/render-embedded-assets.py"
RELEASE_REMOTE_TEMPLATE="$SCRIPT_DIR/stage-f42e2b0-release-remote.sh"
RELEASE_MANAGER="$SCRIPT_DIR/../deploy/manage-production-release.sh"
CANDIDATE_ARCHIVE="$SCRIPT_DIR/../candidate/waw-f42e2b0-source.tar.gz"
SUMMARY_SPIKE_REMOTE_TEMPLATE="$SCRIPT_DIR/openai-summary-marker-spike-remote.sh"
SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE="$SCRIPT_DIR/summary-transient-execution-diagnostic-remote.sh"
RELEASE_READABILITY_REMOTE="$SCRIPT_DIR/repair-staged-f42e2b0-readability-remote.sh"
DEFAULT_OFF_ROLLOUT_TEMPLATE="$SCRIPT_DIR/activate-f42e2b0-default-off-remote.sh"
BOT_UNIT="$SCRIPT_DIR/../deploy/systemd/waw-bot.service"
WEB_UNIT="$SCRIPT_DIR/../deploy/systemd/waw-web.service"
SUMMARY_CREDENTIAL_TEMPLATE="$SCRIPT_DIR/install-summary-api-key-remote.sh"
SUMMARY_ACTIVATION_TEMPLATE="$SCRIPT_DIR/activate-3a73844-summary-remote.sh"
DISCLOSURE_ARCHIVE="${WAW_DISCLOSURE_ARCHIVE_PATH:-$SCRIPT_DIR/../candidate/waw-3a73844-source.tar.gz}"
SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE="$SCRIPT_DIR/diagnose-summary-credential-metadata-remote.sh"
SUMMARY_TIME_UX_TEMPLATE="$SCRIPT_DIR/activate-f8bf082-time-ux-remote.sh"
TIME_UX_ARCHIVE="${WAW_TIME_UX_ARCHIVE_PATH:-$SCRIPT_DIR/../candidate/waw-f8bf082-source.tar.gz}"
SUMMARY_EMPTY_RANGE_TEMPLATE="$SCRIPT_DIR/activate-bb53cf2-empty-range-remote.sh"
EMPTY_RANGE_ARCHIVE="${WAW_EMPTY_RANGE_ARCHIVE_PATH:-$SCRIPT_DIR/../candidate/waw-bb53cf2-source.tar.gz}"
SUMMARY_CONTENT_DIAGNOSTIC_REMOTE="$SCRIPT_DIR/diagnose-summary-content-counts-remote.sh"
EXPECTED_LIB_SHA256=1ad80682e0ba024902b03c1ec175cc6e92743efb8dc162455b7fc17b5af91b97
EXPECTED_REMOTE_SHA256=f68018cafeb3ad0daeabc4e4f52753f87c09e7360d1742be1b624dbd35f627d6
EXPECTED_SCHEMA_RUNNER_SHA256=0d624657e2ab30a43b9defed5f9bd3786f5c1db3092a09feb83caa73e333651d
EXPECTED_BACKUP_SCHEMA_RUNNER_SHA256=83d0b117bcfb1e9035d23dba6b01cc75ce65a36fa0eb14960d75cad980e664a4
EXPECTED_PROVIDER_REMOTE_TEMPLATE_SHA256=07d5c6d39133283035e49447a0fd03ff6a3fd730449a6f6396bd0b5df6dfb109
EXPECTED_PROVIDER_MANAGER_SHA256=6e9783a73c9c48210ce42a164cc0f5d6748dc3a2c0e6c47a0bc320747af81ad7
EXPECTED_PROVIDER_SOURCE_SHA256=b8827b09064dc932599b074d77c1446669c083b9df7ef9f90b28d2c0836d2d0a
EXPECTED_EMBED_RENDERER_SHA256=a01a1731dfa575a11067356f68a8d66135fc427d883edb4d5035d17c9916a7de
EXPECTED_RELEASE_REMOTE_TEMPLATE_SHA256=c67215933e259e9c94e1fa42b8df6af69604f040bd6edbf188657d3a75bac0f8
EXPECTED_RELEASE_MANAGER_SHA256=27f3075de9f938fcf5f90a95d006aab18341f3ee1a39a1276066c44fd01a1017
EXPECTED_CANDIDATE_ARCHIVE_SHA256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b
EXPECTED_SUMMARY_SPIKE_REMOTE_TEMPLATE_SHA256=df9d5f70026b586833574c8c66138b592077191d66bd7a42098fd951fb74194f
EXPECTED_SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE_SHA256=91ae9fb02a5c5e1011c6608bc471be62b4d423019a6a8576e50af57cdedd7f62
EXPECTED_RELEASE_READABILITY_REMOTE_SHA256=3ef828c3cb8ad8412083e1ea6ff308ab7f0727208dd45322cc179a9de6551742
EXPECTED_DEFAULT_OFF_ROLLOUT_TEMPLATE_SHA256=b8c81f492b0a45ec28667688ed886053360bccf449c788d8a04959261ea16a8e
EXPECTED_BOT_UNIT_SHA256=a2696d3fb012a5a832232b3868be36c72a4f4a76aebf9d98aa5ed912caaa1e4e
EXPECTED_WEB_UNIT_SHA256=b5e9ec1d598341c3e8a87252598a41c77c923426d38233e7be7c91f1873ab829
EXPECTED_SUMMARY_CREDENTIAL_TEMPLATE_SHA256=160f8e2102599b61a477dec814060661c4c1a3cb2464271acdcc1f04e76275f8
EXPECTED_SUMMARY_ACTIVATION_TEMPLATE_SHA256=008565fe82bdbed656e5083eb22ade916b38b347f3f758431c844ca90e4009ac
EXPECTED_DISCLOSURE_ARCHIVE_SHA256=3a73844cc5b1cc8f016f9b1e65b00559abe23eb0788ce26517ab766a500a39f3
EXPECTED_SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE_SHA256=9627015a82fd8759be1a9f8e011322527c71a19029889871328bd9abc159e070
EXPECTED_SUMMARY_TIME_UX_TEMPLATE_SHA256=92a706776e8c7ca3edc9c8fb1da454e6f486d0ebfd588d942aa3e2ee34442812
EXPECTED_TIME_UX_ARCHIVE_SHA256=f8bf082e6524a07775222e97bd889a97a77bb87ab41d1a140e16b48374e58393
EXPECTED_SUMMARY_EMPTY_RANGE_TEMPLATE_SHA256=09506706365a4788d2c8bfca826b8ef7e1690db4e5c503d2b855a2c8a5962706
EXPECTED_EMPTY_RANGE_ARCHIVE_SHA256=bb53cf2c3477001fcf09cc13a3340f3d7db9be9eb9263c8723646c297f8122ed
EXPECTED_SUMMARY_CONTENT_DIAGNOSTIC_REMOTE_SHA256=76bc68fdc1c4c8604f15f155add437afcc6c1a996819ca2e8031c5c6ce5569d3
RUN_DIR=
MASTER_STARTED=0
DESTINATION=
QUERY_TOTAL=0

AWS_BIN="${WAW_AWS_BIN:-$(command -v aws || true)}"
SSH_BIN="${WAW_SSH_BIN:-$(command -v ssh || true)}"
TIMEOUT_BIN="${WAW_TIMEOUT_BIN:-$(command -v timeout || true)}"
PYTHON_BIN="${WAW_PYTHON_BIN:-/usr/bin/python3}"
SSH_KEYGEN_BIN="${WAW_SSH_KEYGEN_BIN:-$(command -v ssh-keygen || true)}"
INSTANCE_NAME="${WAW_LIGHTSAIL_INSTANCE_NAME:-}"
EXECUTION_MODE="${WAW_SCHEMA_EXECUTION_MODE:-STATIC_ONLY}"

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  else
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  fi
}

cleanup() {
  local clean=1
  if [[ "$MASTER_STARTED" -eq 1 && -n "$RUN_DIR" && -n "$DESTINATION" ]]; then
    waw_stop_bounded_lightsail_ssh_master \
      "$TIMEOUT_BIN" "$SSH_BIN" "$RUN_DIR/control.sock" "$DESTINATION" ||
      clean=0
    MASTER_STARTED=0
  fi
  if [[ "$clean" -eq 1 && -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -rf -- "$RUN_DIR" || clean=0
  fi
  if [[ "$clean" -eq 0 && -n "$RUN_DIR" && -d "$RUN_DIR" ]]; then
    rm -f -- \
      "$RUN_DIR/access.json" \
      "$RUN_DIR/identity" \
      "$RUN_DIR/certificate" \
      "$RUN_DIR/known-hosts" \
      "$RUN_DIR/remote-user" \
      "$RUN_DIR/remote-host" \
      "$RUN_DIR/destination" \
      "$RUN_DIR/identity.pub" \
      "$RUN_DIR/certificate.info" \
      "$RUN_DIR/ssh.log" \
      "$RUN_DIR/remote.log" \
      "$RUN_DIR/remote.out" 2>/dev/null || true
  fi
  if [[ "$clean" -eq 1 && -n "$RUN_DIR" && -e "$RUN_DIR" ]]; then
    clean=0
  fi
  RUN_DIR=
  [[ "$clean" -eq 1 ]]
}

finish() {
  local result="$1"
  printf 'SCHEMA_DIAGNOSTIC query_total=%s\n' "$QUERY_TOTAL"
  if cleanup; then
    echo 'SCHEMA_DIAGNOSTIC cleanup=PASS transient_remainders=0'
  else
    echo 'SCHEMA_DIAGNOSTIC cleanup=FAIL transient_remainders=1'
    result=FAIL
  fi
  printf 'SCHEMA_DIAGNOSTIC result=%s\n' "$result"
  [[ "$result" == PASS ]]
}

controller_fail() {
  local stage="$1"
  printf 'SCHEMA_DIAGNOSTIC %s=FAIL\n' "$stage"
  finish FAIL
  exit 1
}

classify_ssh_failure() {
  local log="$1"

  if grep -Eiq \
    'permission denied[[:space:]]*\\(publickey\\)|no supported authentication methods' \
    "$log"; then
    printf 'AUTHENTICATION'
  elif grep -Eiq \
    'host key verification failed|remote host identification has changed' \
    "$log"; then
    printf 'HOST_KEY'
  elif grep -Eiq \
    'certificate.*(expired|not yet valid)|certificate invalid' "$log"; then
    printf 'CERTIFICATE'
  elif grep -Eiq \
    'load key|invalid format|error in libcrypto' "$log"; then
    printf 'MATERIAL'
  elif grep -Eiq \
    'connection timed out|no route to host|connection refused|network is unreachable|could not resolve hostname' \
    "$log"; then
    printf 'TRANSPORT'
  else
    printf 'UNKNOWN'
  fi
}

classify_remote_failure() {
  local log="$1"

  if grep -Eiq \
    'control socket.*(no such file|connection refused)|mux_client.*fail' \
    "$log"; then
    printf 'MASTER'
  elif grep -Eiq \
    'sudo:.*(password|required|not allowed|permission denied)' "$log"; then
    printf 'PRIVILEGE'
  elif grep -Eiq \
    '(/bin/bash|bash).*(no such file|not found)' "$log"; then
    printf 'SHELL'
  elif grep -Eiq 'permission denied[[:space:]]*\\(publickey\\)' "$log"; then
    printf 'AUTHENTICATION'
  else
    printf 'UNKNOWN'
  fi
}

[[ -f "$LIB" && -f "$REMOTE" && -f "$SCHEMA_RUNNER" &&
  -f "$BACKUP_SCHEMA_RUNNER" && -f "$PROVIDER_REMOTE_TEMPLATE" &&
  -f "$PROVIDER_MANAGER" && -f "$PROVIDER_SOURCE" ]] ||
  controller_fail controller_start
[[ "$EXECUTION_MODE" == STATIC_ONLY ||
  "$EXECUTION_MODE" == SCHEMA_VERSION_QUERY ||
  "$EXECUTION_MODE" == PROVIDER_DEFAULT_OFF_INSTALL ||
  "$EXECUTION_MODE" == RELEASE_STAGE ||
  "$EXECUTION_MODE" == SUMMARY_MARKER_SPIKE ||
  "$EXECUTION_MODE" == SUMMARY_TRANSIENT_DIAGNOSTIC ||
  "$EXECUTION_MODE" == RELEASE_READABILITY_REPAIR ||
  "$EXECUTION_MODE" == DEFAULT_OFF_ROLLOUT ||
  "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_INSTALL ||
  "$EXECUTION_MODE" == SUMMARY_ACTIVATION ||
  "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_DIAGNOSTIC ||
  "$EXECUTION_MODE" == SUMMARY_TIME_UX_ACTIVATION ||
  "$EXECUTION_MODE" == SUMMARY_EMPTY_RANGE_ACTIVATION ||
  "$EXECUTION_MODE" == SUMMARY_CONTENT_COUNT_DIAGNOSTIC ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$LIB" || true)" == "$EXPECTED_LIB_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$REMOTE" || true)" == "$EXPECTED_REMOTE_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$SCHEMA_RUNNER" || true)" == "$EXPECTED_SCHEMA_RUNNER_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$BACKUP_SCHEMA_RUNNER" || true)" == "$EXPECTED_BACKUP_SCHEMA_RUNNER_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$PROVIDER_REMOTE_TEMPLATE" || true)" == "$EXPECTED_PROVIDER_REMOTE_TEMPLATE_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$PROVIDER_MANAGER" || true)" == "$EXPECTED_PROVIDER_MANAGER_SHA256" ]] ||
  controller_fail controller_start
[[ "$(file_sha256 "$PROVIDER_SOURCE" || true)" == "$EXPECTED_PROVIDER_SOURCE_SHA256" ]] ||
  controller_fail controller_start
if [[ "$EXECUTION_MODE" == RELEASE_STAGE ]]; then
  [[ -f "$EMBED_RENDERER" && -f "$RELEASE_REMOTE_TEMPLATE" &&
    -f "$RELEASE_MANAGER" && -f "$CANDIDATE_ARCHIVE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$EMBED_RENDERER" || true)" == "$EXPECTED_EMBED_RENDERER_SHA256" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$RELEASE_REMOTE_TEMPLATE" || true)" == "$EXPECTED_RELEASE_REMOTE_TEMPLATE_SHA256" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$RELEASE_MANAGER" || true)" == "$EXPECTED_RELEASE_MANAGER_SHA256" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$CANDIDATE_ARCHIVE" || true)" == "$EXPECTED_CANDIDATE_ARCHIVE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_MARKER_SPIKE ]]; then
  [[ -f "$SUMMARY_SPIKE_REMOTE_TEMPLATE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_SPIKE_REMOTE_TEMPLATE" || true)" == "$EXPECTED_SUMMARY_SPIKE_REMOTE_TEMPLATE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_TRANSIENT_DIAGNOSTIC ]]; then
  [[ -f "$SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE" || true)" == "$EXPECTED_SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == RELEASE_READABILITY_REPAIR ]]; then
  [[ -f "$RELEASE_READABILITY_REMOTE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$RELEASE_READABILITY_REMOTE" || true)" == "$EXPECTED_RELEASE_READABILITY_REMOTE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == DEFAULT_OFF_ROLLOUT ]]; then
  [[ -f "$DEFAULT_OFF_ROLLOUT_TEMPLATE" && -f "$EMBED_RENDERER" &&
    -f "$RELEASE_MANAGER" && -f "$BOT_UNIT" && -f "$WEB_UNIT" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$DEFAULT_OFF_ROLLOUT_TEMPLATE" || true)" == "$EXPECTED_DEFAULT_OFF_ROLLOUT_TEMPLATE_SHA256" &&
    "$(file_sha256 "$EMBED_RENDERER" || true)" == "$EXPECTED_EMBED_RENDERER_SHA256" &&
    "$(file_sha256 "$RELEASE_MANAGER" || true)" == "$EXPECTED_RELEASE_MANAGER_SHA256" &&
    "$(file_sha256 "$BOT_UNIT" || true)" == "$EXPECTED_BOT_UNIT_SHA256" &&
    "$(file_sha256 "$WEB_UNIT" || true)" == "$EXPECTED_WEB_UNIT_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_INSTALL ]]; then
  [[ -f "$SUMMARY_CREDENTIAL_TEMPLATE" ]] || controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_CREDENTIAL_TEMPLATE" || true)" == "$EXPECTED_SUMMARY_CREDENTIAL_TEMPLATE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_ACTIVATION ]]; then
  [[ -f "$SUMMARY_ACTIVATION_TEMPLATE" && -f "$DISCLOSURE_ARCHIVE" &&
    -f "$EMBED_RENDERER" && -f "$RELEASE_MANAGER" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_ACTIVATION_TEMPLATE" || true)" == "$EXPECTED_SUMMARY_ACTIVATION_TEMPLATE_SHA256" &&
    "$(file_sha256 "$DISCLOSURE_ARCHIVE" || true)" == "$EXPECTED_DISCLOSURE_ARCHIVE_SHA256" &&
    "$(file_sha256 "$EMBED_RENDERER" || true)" == "$EXPECTED_EMBED_RENDERER_SHA256" &&
    "$(file_sha256 "$RELEASE_MANAGER" || true)" == "$EXPECTED_RELEASE_MANAGER_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_DIAGNOSTIC ]]; then
  [[ -f "$SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE" || true)" == "$EXPECTED_SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_TIME_UX_ACTIVATION ]]; then
  [[ -f "$SUMMARY_TIME_UX_TEMPLATE" && -f "$TIME_UX_ARCHIVE" &&
    -f "$EMBED_RENDERER" && -f "$RELEASE_MANAGER" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_TIME_UX_TEMPLATE" || true)" == "$EXPECTED_SUMMARY_TIME_UX_TEMPLATE_SHA256" &&
    "$(file_sha256 "$TIME_UX_ARCHIVE" || true)" == "$EXPECTED_TIME_UX_ARCHIVE_SHA256" &&
    "$(file_sha256 "$EMBED_RENDERER" || true)" == "$EXPECTED_EMBED_RENDERER_SHA256" &&
    "$(file_sha256 "$RELEASE_MANAGER" || true)" == "$EXPECTED_RELEASE_MANAGER_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_EMPTY_RANGE_ACTIVATION ]]; then
  [[ -f "$SUMMARY_EMPTY_RANGE_TEMPLATE" && -f "$EMPTY_RANGE_ARCHIVE" &&
    -f "$EMBED_RENDERER" && -f "$RELEASE_MANAGER" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_EMPTY_RANGE_TEMPLATE" || true)" == "$EXPECTED_SUMMARY_EMPTY_RANGE_TEMPLATE_SHA256" &&
    "$(file_sha256 "$EMPTY_RANGE_ARCHIVE" || true)" == "$EXPECTED_EMPTY_RANGE_ARCHIVE_SHA256" &&
    "$(file_sha256 "$EMBED_RENDERER" || true)" == "$EXPECTED_EMBED_RENDERER_SHA256" &&
    "$(file_sha256 "$RELEASE_MANAGER" || true)" == "$EXPECTED_RELEASE_MANAGER_SHA256" ]] ||
    controller_fail controller_start
fi
if [[ "$EXECUTION_MODE" == SUMMARY_CONTENT_COUNT_DIAGNOSTIC ]]; then
  [[ -f "$SUMMARY_CONTENT_DIAGNOSTIC_REMOTE" ]] ||
    controller_fail controller_start
  [[ "$(file_sha256 "$SUMMARY_CONTENT_DIAGNOSTIC_REMOTE" || true)" == "$EXPECTED_SUMMARY_CONTENT_DIAGNOSTIC_REMOTE_SHA256" ]] ||
    controller_fail controller_start
fi
[[ -x "$AWS_BIN" && -x "$SSH_BIN" && -x "$SSH_KEYGEN_BIN" &&
  -x "$TIMEOUT_BIN" && -x "$PYTHON_BIN" ]] ||
  controller_fail controller_start
[[ -n "$INSTANCE_NAME" && "$INSTANCE_NAME" != -* &&
  "$INSTANCE_NAME" != *$'\n'* ]] || controller_fail controller_start

# shellcheck source=lib/bounded-lightsail-ssh.sh
source "$LIB"
RUN_DIR="$(mktemp -d /tmp/waw-schema-controller.XXXXXX)" ||
  controller_fail controller_start
chmod 700 "$RUN_DIR" || controller_fail controller_start
echo 'SCHEMA_DIAGNOSTIC controller_start=PASS'

if ! "$TIMEOUT_BIN" --signal=TERM --kill-after=2s 15s \
  "$AWS_BIN" lightsail get-instance-access-details \
  --instance-name "$INSTANCE_NAME" \
  --protocol ssh \
  --region ap-northeast-2 \
  --output json >"$RUN_DIR/access.json" 2>/dev/null; then
  controller_fail access_acquisition
fi
chmod 600 "$RUN_DIR/access.json" || controller_fail access_acquisition

if ! "$PYTHON_BIN" - "$RUN_DIR/access.json" "$RUN_DIR" \
  >/dev/null 2>/dev/null <<'PY'
import ipaddress
import json
import os
import pathlib
import re
import sys

access_path, output_path = map(pathlib.Path, sys.argv[1:])
payload = json.loads(access_path.read_text(encoding="utf-8"))
details = payload.get("accessDetails")
if not isinstance(details, dict):
    raise SystemExit(20)
private_key = details.get("privateKey")
certificate = details.get("certKey")
remote_user = details.get("username")
remote_host = details.get("ipAddress")
host_keys = details.get("hostKeys")
if not all(isinstance(value, str) and value for value in (
    private_key,
    certificate,
    remote_user,
    remote_host,
)):
    raise SystemExit(21)
if not re.fullmatch(r"[a-z_][a-z0-9_-]*", remote_user):
    raise SystemExit(22)
ipaddress.IPv4Address(remote_host)
if not isinstance(host_keys, list) or not host_keys:
    raise SystemExit(23)
known_hosts = []
for host_key in host_keys:
    if not isinstance(host_key, dict):
        raise SystemExit(24)
    algorithm = host_key.get("algorithm")
    public_key = host_key.get("publicKey")
    if not isinstance(algorithm, str) or not re.fullmatch(
        r"[A-Za-z0-9@._+-]+",
        algorithm,
    ):
        raise SystemExit(25)
    if not isinstance(public_key, str) or not re.fullmatch(
        r"[A-Za-z0-9+/=]+",
        public_key,
    ):
        raise SystemExit(26)
    known_hosts.append(f"{remote_host} {algorithm} {public_key}\n")
files = {
    "identity": private_key.rstrip("\n") + "\n",
    "certificate": certificate.rstrip("\n") + "\n",
    "known-hosts": "".join(known_hosts),
    "remote-user": remote_user + "\n",
    "remote-host": remote_host + "\n",
    "destination": f"{remote_user}@{remote_host}\n",
}
for name, value in files.items():
    target = output_path / name
    target.write_text(value, encoding="utf-8")
    os.chmod(target, 0o600)
PY
then
  controller_fail access_acquisition
fi
echo 'SCHEMA_DIAGNOSTIC access_acquisition=PASS'

if ! "$SSH_KEYGEN_BIN" -y -f "$RUN_DIR/identity" \
  >"$RUN_DIR/identity.pub" 2>/dev/null ||
  ! "$SSH_KEYGEN_BIN" -Lf "$RUN_DIR/certificate" \
    >"$RUN_DIR/certificate.info" 2>/dev/null; then
  controller_fail material_validation
fi
chmod 600 "$RUN_DIR/identity.pub" "$RUN_DIR/certificate.info" ||
  controller_fail material_validation
private_fingerprint="$(
  "$SSH_KEYGEN_BIN" -lf "$RUN_DIR/identity.pub" -E sha256 2>/dev/null |
    awk 'NR == 1 {print $2}'
)"
certificate_fingerprint="$(
  awk '$1 == "Public" && $2 == "key:" {print $4; exit}' \
    "$RUN_DIR/certificate.info"
)"
[[ "$private_fingerprint" =~ ^SHA256:[A-Za-z0-9+/]+$ &&
  "$private_fingerprint" == "$certificate_fingerprint" ]] ||
  controller_fail material_validation
private_fingerprint=
certificate_fingerprint=
if ! "$SSH_KEYGEN_BIN" -lf "$RUN_DIR/known-hosts" -E sha256 \
  >/dev/null 2>/dev/null; then
  controller_fail material_validation
fi
echo 'SCHEMA_DIAGNOSTIC material_validation=PASS'

remote_user="$(<"$RUN_DIR/remote-user")"
remote_host="$(<"$RUN_DIR/remote-host")"
DESTINATION="$(<"$RUN_DIR/destination")"
remote_rc=0
remote_program="$REMOTE"
operation_timeout=30s
if [[ "$EXECUTION_MODE" == SCHEMA_VERSION_QUERY ]]; then
  remote_program="$BACKUP_SCHEMA_RUNNER"
elif [[ "$EXECUTION_MODE" == PROVIDER_DEFAULT_OFF_INSTALL ]]; then
  remote_program="$RUN_DIR/provider-default-off-remote.sh"
  manager_b64="$(
    "$PYTHON_BIN" -c \
      'import base64,pathlib,sys; print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode("ascii"))' \
      "$PROVIDER_MANAGER" 2>/dev/null || true
  )"
  source_b64="$(
    "$PYTHON_BIN" -c \
      'import base64,pathlib,sys; print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode("ascii"))' \
      "$PROVIDER_SOURCE" 2>/dev/null || true
  )"
  if [[ -z "$manager_b64" || -z "$source_b64" ]] ||
    ! "$PYTHON_BIN" -c \
      'import pathlib,sys; p=pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"); assert p.count("__WAW_MANAGER_B64__")==1; assert p.count("__WAW_SOURCE_B64__")==1; pathlib.Path(sys.argv[2]).write_text(p.replace("__WAW_MANAGER_B64__",sys.argv[3]).replace("__WAW_SOURCE_B64__",sys.argv[4]),encoding="utf-8")' \
      "$PROVIDER_REMOTE_TEMPLATE" \
      "$remote_program" \
      "$manager_b64" \
      "$source_b64" >/dev/null 2>/dev/null
  then
    controller_fail controller_start
  fi
  manager_b64=
  source_b64=
  chmod 600 "$remote_program" || controller_fail controller_start
elif [[ "$EXECUTION_MODE" == RELEASE_STAGE ]]; then
  remote_program="$RUN_DIR/release-stage-remote.sh"
  if ! "$PYTHON_BIN" \
    "$EMBED_RENDERER" \
    "$RELEASE_REMOTE_TEMPLATE" \
    "$remote_program" \
    "__WAW_CANDIDATE_ARCHIVE_B64__=$CANDIDATE_ARCHIVE" \
    "__WAW_RELEASE_MANAGER_B64__=$RELEASE_MANAGER" \
    >/dev/null 2>/dev/null; then
    controller_fail controller_start
  fi
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_MARKER_SPIKE ]]; then
  remote_program="$RUN_DIR/summary-marker-spike-remote.sh"
  IFS= read -r openai_key || controller_fail controller_start
  [[ ${#openai_key} -ge 20 && ${#openai_key} -le 512 &&
    "$openai_key" != *$'\r'* && "$openai_key" != *$'\n'* ]] ||
    controller_fail controller_start
  key_b64="$(
    printf '%s' "$openai_key" |
      base64 |
      tr -d '\n' 2>/dev/null
  )"
  openai_key=
  [[ -n "$key_b64" ]] || controller_fail controller_start
  if ! "$PYTHON_BIN" -c \
    'import pathlib,sys; p=pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"); assert p.count("__WAW_OPENAI_KEY_B64__")==1; pathlib.Path(sys.argv[2]).write_text(p.replace("__WAW_OPENAI_KEY_B64__",sys.argv[3]),encoding="utf-8")' \
    "$SUMMARY_SPIKE_REMOTE_TEMPLATE" "$remote_program" "$key_b64" \
    >/dev/null 2>/dev/null; then
    key_b64=
    controller_fail controller_start
  fi
  key_b64=
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_TRANSIENT_DIAGNOSTIC ]]; then
  remote_program="$SUMMARY_TRANSIENT_DIAGNOSTIC_REMOTE"
elif [[ "$EXECUTION_MODE" == RELEASE_READABILITY_REPAIR ]]; then
  remote_program="$RELEASE_READABILITY_REMOTE"
elif [[ "$EXECUTION_MODE" == DEFAULT_OFF_ROLLOUT ]]; then
  remote_program="$RUN_DIR/default-off-rollout-remote.sh"
  if ! "$PYTHON_BIN" \
    "$EMBED_RENDERER" \
    "$DEFAULT_OFF_ROLLOUT_TEMPLATE" \
    "$remote_program" \
    "__WAW_RELEASE_MANAGER_B64__=$RELEASE_MANAGER" \
    "__WAW_BOT_UNIT_B64__=$BOT_UNIT" \
    "__WAW_WEB_UNIT_B64__=$WEB_UNIT" \
    "__WAW_BRIDGE_B64__=$PROVIDER_SOURCE" \
    >/dev/null 2>/dev/null; then
    controller_fail controller_start
  fi
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_INSTALL ]]; then
  remote_program="$RUN_DIR/summary-credential-install-remote.sh"
  IFS= read -r openai_key || controller_fail controller_start
  [[ ${#openai_key} -ge 20 && ${#openai_key} -le 512 &&
    "$openai_key" != *$'\r'* && "$openai_key" != *$'\n'* ]] ||
    controller_fail controller_start
  key_b64="$(
    printf '%s' "$openai_key" | base64 | tr -d '\n' 2>/dev/null
  )"
  openai_key=
  [[ -n "$key_b64" ]] || controller_fail controller_start
  if ! "$PYTHON_BIN" -c \
    'import pathlib,sys; p=pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"); assert p.count("__WAW_OPENAI_KEY_B64__")==1; pathlib.Path(sys.argv[2]).write_text(p.replace("__WAW_OPENAI_KEY_B64__",sys.argv[3]),encoding="utf-8")' \
    "$SUMMARY_CREDENTIAL_TEMPLATE" "$remote_program" "$key_b64" \
    >/dev/null 2>/dev/null; then
    key_b64=
    controller_fail controller_start
  fi
  key_b64=
  chmod 600 "$remote_program" || controller_fail controller_start
elif [[ "$EXECUTION_MODE" == SUMMARY_ACTIVATION ]]; then
  remote_program="$RUN_DIR/summary-activation-remote.sh"
  if ! "$PYTHON_BIN" \
    "$EMBED_RENDERER" \
    "$SUMMARY_ACTIVATION_TEMPLATE" \
    "$remote_program" \
    "__WAW_DISCLOSURE_ARCHIVE_B64__=$DISCLOSURE_ARCHIVE" \
    "__WAW_RELEASE_MANAGER_B64__=$RELEASE_MANAGER" \
    >/dev/null 2>/dev/null; then
    controller_fail controller_start
  fi
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_DIAGNOSTIC ]]; then
  remote_program="$SUMMARY_CREDENTIAL_DIAGNOSTIC_REMOTE"
elif [[ "$EXECUTION_MODE" == SUMMARY_TIME_UX_ACTIVATION ]]; then
  remote_program="$RUN_DIR/summary-time-ux-remote.sh"
  if ! "$PYTHON_BIN" \
    "$EMBED_RENDERER" \
    "$SUMMARY_TIME_UX_TEMPLATE" \
    "$remote_program" \
    "__WAW_TIME_UX_ARCHIVE_B64__=$TIME_UX_ARCHIVE" \
    "__WAW_RELEASE_MANAGER_B64__=$RELEASE_MANAGER" \
    >/dev/null 2>/dev/null; then
    controller_fail controller_start
  fi
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_EMPTY_RANGE_ACTIVATION ]]; then
  remote_program="$RUN_DIR/summary-empty-range-remote.sh"
  if ! "$PYTHON_BIN" \
    "$EMBED_RENDERER" \
    "$SUMMARY_EMPTY_RANGE_TEMPLATE" \
    "$remote_program" \
    "__WAW_EMPTY_RANGE_ARCHIVE_B64__=$EMPTY_RANGE_ARCHIVE" \
    "__WAW_RELEASE_MANAGER_B64__=$RELEASE_MANAGER" \
    >/dev/null 2>/dev/null; then
    controller_fail controller_start
  fi
  chmod 600 "$remote_program" || controller_fail controller_start
  operation_timeout=600s
elif [[ "$EXECUTION_MODE" == SUMMARY_CONTENT_COUNT_DIAGNOSTIC ]]; then
  remote_program="$SUMMARY_CONTENT_DIAGNOSTIC_REMOTE"
fi
waw_run_over_bounded_lightsail_ssh_direct \
  "$TIMEOUT_BIN" \
  "$SSH_BIN" \
  "$RUN_DIR/identity" \
  "$RUN_DIR/certificate" \
  "$RUN_DIR/known-hosts" \
  "$remote_user" \
  "$remote_host" \
  "$DESTINATION" \
  "$RUN_DIR/remote.log" \
  /bin/bash \
  "$operation_timeout" \
  <"$remote_program" >"$RUN_DIR/remote.out" || remote_rc=$?
remote_output="$(<"$RUN_DIR/remote.out")"

if [[ "$EXECUTION_MODE" == SUMMARY_CONTENT_COUNT_DIAGNOSTIC ]]; then
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_rc" -eq 0 &&
    "$remote_output" =~ SUMMARY_CONTENT_DIAGNOSTIC\ counts=total:([0-9]+),content:([0-9]+),within10:([0-9]+),within10content:([0-9]+),within24:([0-9]+),within24content:([0-9]+) &&
    "$remote_output" =~ SUMMARY_CONTENT_DIAGNOSTIC\ classification=(HISTORY_EMPTY_OR_PERMISSION|RECENT_10M_EMPTY|CONTENT_REDACTED|CONTENT_AVAILABLE)\ db_queries=1\ discord_requests=1\ provider_calls=0 &&
    "$remote_output" =~ SUMMARY_CONTENT_DIAGNOSTIC\ result=PASS\ sensitive_output=0 ]]; then
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  if [[ "$remote_output" =~ SUMMARY_CONTENT_DIAGNOSTIC\ result=FAIL\ stage=([A-Z_]+)\ class=([A-Z_]+) ]]; then
    printf 'SUMMARY_CONTENT_DIAGNOSTIC result=FAIL stage=%s class=%s\n' \
      "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  elif [[ "$remote_output" =~ SUMMARY_CONTENT_DIAGNOSTIC\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'SUMMARY_CONTENT_DIAGNOSTIC result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'SUMMARY_CONTENT_DIAGNOSTIC result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_EMPTY_RANGE_ACTIVATION ]]; then
  empty_range_pass="$(
    printf '%s\n' \
      'SUMMARY_EMPTY_RANGE stage=PASS map_fixture=PASS intent=PASS guidance=PASS' \
      'SUMMARY_EMPTY_RANGE activation=PASS restarts=2 health=PASS singleton=PASS' \
      'SUMMARY_EMPTY_RANGE flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0' \
      'SUMMARY_EMPTY_RANGE cleanup=PASS transient=0' \
      'SUMMARY_EMPTY_RANGE result=PASS release=bb53cf2'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$empty_range_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ SUMMARY_EMPTY_RANGE\ rollback=(PASS|FAIL|NOT_REQUIRED) ]]; then
    printf 'SUMMARY_EMPTY_RANGE rollback=%s\n' "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_EMPTY_RANGE\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'SUMMARY_EMPTY_RANGE result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'SUMMARY_EMPTY_RANGE result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_TIME_UX_ACTIVATION ]]; then
  time_ux_pass="$(
    printf '%s\n' \
      'SUMMARY_TIME_UX stage=PASS command_schema=PASS' \
      'SUMMARY_TIME_UX command_registration=PASS requests=4' \
      'SUMMARY_TIME_UX activation=PASS restarts=2 health=PASS singleton=PASS' \
      'SUMMARY_TIME_UX flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0' \
      'SUMMARY_TIME_UX cleanup=PASS transient=0' \
      'SUMMARY_TIME_UX result=PASS release=f8bf082'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$time_ux_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ SUMMARY_TIME_UX\ rollback=(PASS|FAIL|NOT_REQUIRED) ]]; then
    printf 'SUMMARY_TIME_UX rollback=%s\n' "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_TIME_UX\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'SUMMARY_TIME_UX result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'SUMMARY_TIME_UX result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_DIAGNOSTIC ]]; then
  if [[ "$remote_rc" -eq 0 &&
    "$remote_output" =~ SUMMARY_CREDENTIAL_DIAGNOSTIC\ tools=PASS &&
    "$remote_output" =~ SUMMARY_CREDENTIAL_DIAGNOSTIC\ target=(ABSENT|REGULAR|SYMLINK|NON_REGULAR) &&
    "$remote_output" =~ SUMMARY_CREDENTIAL_DIAGNOSTIC\ services=PASS &&
    "$remote_output" =~ SUMMARY_CREDENTIAL_DIAGNOSTIC\ flags=PASS\ provider=0\ quota=0 &&
    "$remote_output" =~ SUMMARY_CREDENTIAL_DIAGNOSTIC\ result=PASS\ mutation=0\ restart=0\ provider_calls=0 ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  printf '%s\n' "$remote_output" |
    grep -E '^SUMMARY_CREDENTIAL_DIAGNOSTIC (tools|target|metadata|bot_direct_read|services|flags|result)=' ||
    true
  echo 'SUMMARY_CREDENTIAL_DIAGNOSTIC result=FAIL'
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_ACTIVATION ]]; then
  activation_pass="$(
    printf '%s\n' \
      'SUMMARY_ACTIVATION stage=PASS disclosure=PASS' \
      'SUMMARY_ACTIVATION activation=PASS daemon_reload=1 restarts=2' \
      'SUMMARY_ACTIVATION health=PASS singleton=PASS failed_units=0' \
      'SUMMARY_ACTIVATION flags=provider:1,quota:1,game:0 provider_calls=0 migrations=0' \
      'SUMMARY_ACTIVATION cleanup=PASS transient=0' \
      'SUMMARY_ACTIVATION result=PASS release=3a73844'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$activation_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ SUMMARY_ACTIVATION\ rollback=(PASS|FAIL|NOT_REQUIRED) ]]; then
    printf 'SUMMARY_ACTIVATION rollback=%s\n' "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_ACTIVATION\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'SUMMARY_ACTIVATION result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'SUMMARY_ACTIVATION result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_CREDENTIAL_INSTALL ]]; then
  credential_pass="$(
    printf '%s\n' \
      'SUMMARY_CREDENTIAL precondition=PASS' \
      'SUMMARY_CREDENTIAL default_off=PASS' \
      'SUMMARY_CREDENTIAL material=PASS' \
      'SUMMARY_CREDENTIAL install=PASS metadata=root:root:600' \
      'SUMMARY_CREDENTIAL isolation=PASS bot_direct_read=DENY' \
      'SUMMARY_CREDENTIAL identity=PASS restart=0 provider_calls=0' \
      'SUMMARY_CREDENTIAL cleanup=PASS transient=0' \
      'SUMMARY_CREDENTIAL result=PASS'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$credential_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ SUMMARY_CREDENTIAL\ rollback=(PASS|FAIL|NOT_REQUIRED) ]]; then
    printf 'SUMMARY_CREDENTIAL rollback=%s\n' "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_CREDENTIAL\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'SUMMARY_CREDENTIAL result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'SUMMARY_CREDENTIAL result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == DEFAULT_OFF_ROLLOUT ]]; then
  rollout_pass="$(
    printf '%s\n' \
      'DEFAULT_OFF_ROLLOUT precondition=PASS backup=PASS' \
      'DEFAULT_OFF_ROLLOUT activation=PASS daemon_reload=1 bridge_removed=1' \
      'DEFAULT_OFF_ROLLOUT health=PASS singleton=PASS failed_units=0' \
      'DEFAULT_OFF_ROLLOUT flags=0,0,0,0 provider_calls=0 migrations=0' \
      'DEFAULT_OFF_ROLLOUT cleanup=PASS transient=0' \
      'DEFAULT_OFF_ROLLOUT result=PASS release=f42e2b0 restarts=2'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$rollout_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ DEFAULT_OFF_ROLLOUT\ rollback=(PASS|FAIL|NOT_REQUIRED) ]]; then
    printf 'DEFAULT_OFF_ROLLOUT rollback=%s\n' "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ DEFAULT_OFF_ROLLOUT\ result=FAIL\ stage=([A-Z_]+) ]]; then
    printf 'DEFAULT_OFF_ROLLOUT result=FAIL stage=%s\n' "${BASH_REMATCH[1]}"
  else
    echo 'DEFAULT_OFF_ROLLOUT result=FAIL stage=REMOTE'
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == RELEASE_READABILITY_REPAIR ]]; then
  repair_pass="$(
    printf '%s\n' \
      'RELEASE_READABILITY precondition=PASS activation=0 restart=0' \
      'RELEASE_READABILITY bot_import=PASS validate=PASS network=0' \
      'RELEASE_READABILITY permissions=PASS readable=1 writable=0' \
      'RELEASE_READABILITY cleanup=PASS transient=0' \
      'RELEASE_READABILITY result=PASS activation=0 restart=0'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$repair_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  if [[ "$remote_output" =~ RELEASE_READABILITY\ stage=([A-Z_]+)\ result=FAIL ]]; then
    printf 'RELEASE_READABILITY stage=%s result=FAIL\n' "${BASH_REMATCH[1]}"
  fi
  echo 'RELEASE_READABILITY result=FAIL'
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_TRANSIENT_DIAGNOSTIC ]]; then
  diagnostic_pass="$(
    printf '%s\n' \
      'SUMMARY_TRANSIENT_DIAGNOSTIC execution_rc=0 bootstrap_count=1 imports_count=1 credential_count=1 stdout_count=1 stderr_count=1' \
      'SUMMARY_TRANSIENT_DIAGNOSTIC failure_class=NONE' \
      'SUMMARY_TRANSIENT_DIAGNOSTIC cleanup=PASS transient=0' \
      'SUMMARY_TRANSIENT_DIAGNOSTIC result=PASS network=0 credential=0 request=0'
  )"
  if [[ "$remote_rc" -eq 0 && "$remote_output" == "$diagnostic_pass" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  output_line_count="$(
    if [[ -n "$remote_output" ]]; then
      printf '%s\n' "$remote_output" | wc -l | tr -d ' '
    else
      printf '0'
    fi
  )"
  printf 'SUMMARY_TRANSIENT_DIAGNOSTIC remote_rc=%s output_lines=%s\n' \
    "$remote_rc" "$output_line_count"
  if [[ -z "$remote_output" ]]; then
    failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
    if [[ "$failure_class" == UNKNOWN ]]; then
      failure_class="$(classify_remote_failure "$RUN_DIR/remote.log")"
    fi
    printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
  else
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
  fi
  if [[ "$remote_output" =~ SUMMARY_TRANSIENT_DIAGNOSTIC\ execution_rc=([0-9]+)\ bootstrap_count=([0-9]+)\ imports_count=([0-9]+)\ credential_count=([0-9]+)\ stdout_count=([0-9]+)\ stderr_count=([0-9]+) ]]; then
    printf 'SUMMARY_TRANSIENT_DIAGNOSTIC execution_rc=%s bootstrap_count=%s imports_count=%s credential_count=%s stdout_count=%s stderr_count=%s\n' \
      "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" \
      "${BASH_REMATCH[4]}" "${BASH_REMATCH[5]}" "${BASH_REMATCH[6]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_TRANSIENT_DIAGNOSTIC\ stage=([A-Z_]+)\ result=FAIL ]]; then
    printf 'SUMMARY_TRANSIENT_DIAGNOSTIC stage=%s result=FAIL\n' \
      "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_TRANSIENT_DIAGNOSTIC\ failure_class=(PROPERTY|CREDENTIAL_LOAD|CREDENTIAL_DIRECTORY|CREDENTIAL_MISMATCH|MODULE_IMPORT|FILE_MISSING|FILE_PERMISSION|PERMISSION|UNIT_CONFLICT|UNKNOWN|NONE) ]]; then
    printf 'SUMMARY_TRANSIENT_DIAGNOSTIC failure_class=%s\n' \
      "${BASH_REMATCH[1]}"
  fi
  if [[ "$remote_output" =~ SUMMARY_TRANSIENT_DIAGNOSTIC\ cleanup=(PASS|FAIL)\ transient=(0|UNKNOWN) ]]; then
    printf 'SUMMARY_TRANSIENT_DIAGNOSTIC cleanup=%s transient=%s\n' \
      "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  fi
  echo 'SUMMARY_TRANSIENT_DIAGNOSTIC result=FAIL'
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SUMMARY_MARKER_SPIKE ]]; then
  if [[ "$remote_rc" -eq 0 &&
    "$remote_output" =~ SUMMARY_SPIKE\ request=PASS\ completed=1 &&
    "$remote_output" =~ SUMMARY_SPIKE\ markers\ omission=0\ duplicate=0\ wrong_section=0\ unmarked=0 &&
    "$remote_output" =~ SUMMARY_SPIKE\ validator=PASS\ schema=PASS\ invented=0\ unexpected=0 &&
    "$remote_output" =~ SUMMARY_SPIKE\ observed_requests=1 &&
    "$remote_output" =~ SUMMARY_SPIKE\ cleanup=PASS\ credential=0\ transient=0 &&
    "$remote_output" =~ SUMMARY_SPIKE\ request_total=1\ retry=0 &&
    "$remote_output" =~ SUMMARY_SPIKE\ result=PASS\ stage=COMPLETE\ flags=0,0,0,0\ activation=0\ restart=0 ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
  if [[ -n "$remote_output" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
  else
    printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == RELEASE_STAGE ]]; then
  release_pass="$(
    printf '%s\n' \
      'RELEASE_STAGE precondition=PASS flags=0,0,0,0' \
      'RELEASE_STAGE material=PASS sha256=962bc2949a4fea4317060ec942a16986454ff67ac0136ef0d3d0669fbefe513b bytes=640107' \
      'RELEASE_STAGE build=PASS' \
      'RELEASE_STAGE identity=PASS migrations=8 writable=0' \
      'RELEASE_STAGE cleanup=PASS transient_remainders=0' \
      'RELEASE_STAGE result=PASS release=f42e2b0 activation=0 restart=0'
  )"
  if [[ "$remote_output" == "$release_pass" && "$remote_rc" -eq 0 ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
  if [[ -n "$remote_output" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    echo 'RELEASE_STAGE result=FAIL stage=REMOTE'
  else
    printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == PROVIDER_DEFAULT_OFF_INSTALL ]]; then
  provider_pass="$(
    printf '%s\n' \
      'PROVIDER_DEFAULT_OFF precondition=PASS' \
      'PROVIDER_DEFAULT_OFF material=PASS' \
      'PROVIDER_DEFAULT_OFF install=PASS daemon_reload=1 service_restart=0' \
      'PROVIDER_DEFAULT_OFF metadata=PASS' \
      'PROVIDER_DEFAULT_OFF declaration=PASS zero=1 one=0 other=0' \
      'PROVIDER_DEFAULT_OFF resolved=PASS zero=1 one=0 other=0' \
      'PROVIDER_DEFAULT_OFF bot_identity=PASS' \
      'PROVIDER_DEFAULT_OFF health=PASS' \
      'PROVIDER_DEFAULT_OFF failed_units=PASS count=0' \
      'PROVIDER_DEFAULT_OFF cleanup=PASS transient_remainders=0' \
      'PROVIDER_DEFAULT_OFF result=PASS'
  )"
  if [[ "$remote_output" == "$provider_pass" && "$remote_rc" -eq 0 ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish PASS
    exit 0
  fi
  failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
  if [[ -n "$remote_output" ]]; then
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    echo 'PROVIDER_DEFAULT_OFF result=FAIL stage=REMOTE'
  else
    printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
  fi
  finish FAIL
  exit 1
fi

if [[ "$EXECUTION_MODE" == SCHEMA_VERSION_QUERY ]]; then
  schema_pass="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
      'SCHEMA_PREFLIGHT query=PASS version=8'
  )"
  schema_client_fail='SCHEMA_PREFLIGHT client=FAIL version=UNKNOWN'
  schema_credential_fail="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=FAIL version=UNKNOWN'
  )"
  schema_credential_parse_fail="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
      'SCHEMA_PREFLIGHT credential_parse=FAIL version=UNKNOWN'
  )"
  schema_query_execution_fail="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
      'SCHEMA_PREFLIGHT query_execution=FAIL version=UNKNOWN'
  )"
  schema_query_result_fail="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
      'SCHEMA_PREFLIGHT query_result=FAIL version=UNKNOWN'
  )"
  schema_query_version_fail="$(
    printf '%s\n' \
      'SCHEMA_PREFLIGHT client_major=17' \
      'SCHEMA_PREFLIGHT credential_metadata=PASS source=BACKUP_ROLE' \
      'SCHEMA_PREFLIGHT query_version=FAIL version=UNKNOWN'
  )"

  case "$remote_output" in
    "$schema_pass")
      [[ "$remote_rc" -eq 0 ]] || controller_fail remote_entry
      QUERY_TOTAL=1
      echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
      printf '%s\n' "$remote_output"
      echo 'SCHEMA_DIAGNOSTIC sql_dispatch=PASS mode=SCHEMA_VERSION_QUERY'
      finish PASS
      exit 0
      ;;
    "$schema_client_fail"|"$schema_credential_fail"|"$schema_credential_parse_fail")
      echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
      printf '%s\n' "$remote_output"
      finish FAIL
      exit 1
      ;;
    "$schema_query_execution_fail"|"$schema_query_result_fail"|\
      "$schema_query_version_fail")
      QUERY_TOTAL=1
      echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
      printf '%s\n' "$remote_output"
      finish FAIL
      exit 1
      ;;
    *)
      failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
      if [[ "$failure_class" == UNKNOWN ]]; then
        failure_class="$(classify_remote_failure "$RUN_DIR/remote.log")"
      fi
      if [[ "$failure_class" == PRIVILEGE || "$failure_class" == SHELL ]]; then
        echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
        printf 'SCHEMA_DIAGNOSTIC remote_entry=FAIL class=%s\n' "$failure_class"
      else
        printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
      fi
      finish FAIL
      exit 1
      ;;
  esac
fi

remote_pass="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=PASS' \
    'SCHEMA_DIAGNOSTIC connection=PASS'
)"
remote_client_fail="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=FAIL'
)"
remote_uri_fail="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=FAIL'
)"
remote_connection_fail="$(
  printf '%s\n' \
    'SCHEMA_DIAGNOSTIC remote_entry=PASS' \
    'SCHEMA_DIAGNOSTIC client_execution=PASS' \
    'SCHEMA_DIAGNOSTIC uri_parse=PASS' \
    'SCHEMA_DIAGNOSTIC connection=FAIL'
)"

case "$remote_output" in
  "$remote_pass")
    [[ "$remote_rc" -eq 0 ]] || controller_fail remote_entry
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    ;;
  "$remote_client_fail"|"$remote_uri_fail"|"$remote_uri_fail"\ class=METADATA|\
    "$remote_uri_fail"\ class=ENCODING|"$remote_uri_fail"\ class=SHAPE|\
    "$remote_uri_fail"\ class=SYNTAX|"$remote_uri_fail"\ class=SCHEME|\
    "$remote_uri_fail"\ class=AUTHORITY|"$remote_uri_fail"\ class=DATABASE|\
    "$remote_uri_fail"\ class=QUERY|"$remote_connection_fail")
    echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
    printf '%s\n' "$remote_output"
    finish FAIL
    exit 1
    ;;
  *)
    failure_class="$(classify_ssh_failure "$RUN_DIR/remote.log")"
    if [[ "$failure_class" == UNKNOWN ]]; then
      failure_class="$(classify_remote_failure "$RUN_DIR/remote.log")"
    fi
    if [[ "$failure_class" == PRIVILEGE || "$failure_class" == SHELL ]]; then
      echo 'SCHEMA_DIAGNOSTIC ssh_connection=PASS'
      printf 'SCHEMA_DIAGNOSTIC remote_entry=FAIL class=%s\n' "$failure_class"
    else
      printf 'SCHEMA_DIAGNOSTIC ssh_connection=FAIL class=%s\n' "$failure_class"
    fi
    finish FAIL
    exit 1
    ;;
esac

echo 'SCHEMA_DIAGNOSTIC sql_dispatch=PASS mode=STATIC_ONLY'
finish PASS
