#!/usr/bin/env bash

# Shared, output-silent SSH establishment contract for production read-only
# diagnostics. Callers own access acquisition, materialization, labels, and
# cleanup. Keeping this boundary in one asset prevents diagnostic controllers
# from silently drifting in authentication or retry behavior.
waw_start_bounded_lightsail_ssh_master() {
  [[ "$#" -eq 9 || "$#" -eq 10 ]] || return 64

  local timeout_bin="$1"
  local ssh_bin="$2"
  local identity_file="$3"
  local certificate_file="$4"
  local known_hosts_file="$5"
  local control_socket="$6"
  local remote_user="$7"
  local remote_host="$8"
  local destination="$9"
  local error_log="${10:-}"

  [[ -x "$timeout_bin" && -x "$ssh_bin" ]] || return 65
  [[ "$identity_file" == /* && -f "$identity_file" && ! -L "$identity_file" ]] ||
    return 66
  [[ "$certificate_file" == /* && -f "$certificate_file" &&
    ! -L "$certificate_file" ]] || return 67
  [[ "$known_hosts_file" == /* && -f "$known_hosts_file" &&
    ! -L "$known_hosts_file" ]] || return 68
  [[ "$control_socket" == /* && ! -e "$control_socket" ]] || return 69
  [[ "$remote_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || return 70
  [[ -n "$remote_host" && "$remote_host" != -* ]] || return 71
  [[ "$destination" == "${remote_user}@${remote_host}" ]] || return 72
  if [[ -n "$error_log" ]]; then
    [[ "$error_log" == /* && ! -L "$error_log" &&
      (! -e "$error_log" || -f "$error_log") ]] || return 75
  fi

  local log_level=QUIET
  [[ -z "$error_log" ]] || log_level=ERROR

  local -a ssh_options=(
    -o BatchMode=yes
    -o IdentitiesOnly=yes
    -o IdentityAgent=none
    -o "IdentityFile=$identity_file"
    -o "CertificateFile=$certificate_file"
    -o "UserKnownHostsFile=$known_hosts_file"
    -o GlobalKnownHostsFile=/dev/null
    -o StrictHostKeyChecking=yes
    -o CheckHostIP=no
    -o PasswordAuthentication=no
    -o KbdInteractiveAuthentication=no
    -o PreferredAuthentications=publickey
    -o ConnectTimeout=10
    -o ConnectionAttempts=1
    -o ServerAliveInterval=5
    -o ServerAliveCountMax=1
    -o ControlMaster=yes
    -o ControlPersist=no
    -o "LogLevel=$log_level"
  )

  if [[ -n "$error_log" ]]; then
    "$timeout_bin" --signal=TERM --kill-after=2s 15s \
      "$ssh_bin" "${ssh_options[@]}" -M -S "$control_socket" -fN \
      "$destination" </dev/null >/dev/null 2>"$error_log" || return 73
  else
    "$timeout_bin" --signal=TERM --kill-after=2s 15s \
      "$ssh_bin" "${ssh_options[@]}" -M -S "$control_socket" -fN \
      "$destination" </dev/null >/dev/null 2>&1 || return 73
  fi

  if ! "$ssh_bin" -S "$control_socket" -O check "$destination" \
    </dev/null >/dev/null 2>&1; then
    "$timeout_bin" --signal=TERM --kill-after=1s 5s \
      "$ssh_bin" -S "$control_socket" -O exit "$destination" \
      </dev/null >/dev/null 2>&1 || true
    return 74
  fi
}

waw_stop_bounded_lightsail_ssh_master() {
  [[ "$#" -eq 4 ]] || return 64

  local timeout_bin="$1"
  local ssh_bin="$2"
  local control_socket="$3"
  local destination="$4"

  [[ -x "$timeout_bin" && -x "$ssh_bin" ]] || return 65
  [[ "$control_socket" == /* ]] || return 66
  [[ -n "$destination" && "$destination" != -* ]] || return 67

  if "$timeout_bin" --signal=TERM --kill-after=1s 5s \
    "$ssh_bin" -S "$control_socket" -O exit "$destination" \
    </dev/null >/dev/null 2>&1; then
    return 0
  fi

  # OpenSSH can report a failed exit after the master has already stopped. If
  # the socket remains, prove that no live master answers before removing only
  # that private-run-directory socket.
  if [[ -e "$control_socket" ]]; then
    if "$timeout_bin" --signal=TERM --kill-after=1s 5s \
      "$ssh_bin" -S "$control_socket" -O check "$destination" \
      </dev/null >/dev/null 2>&1; then
      return 68
    fi
    rm -f -- "$control_socket" || return 69
  fi
  [[ ! -e "$control_socket" ]]
}

waw_run_over_bounded_lightsail_ssh_master() {
  [[ "$#" -eq 4 || "$#" -eq 5 ]] || return 64

  local timeout_bin="$1"
  local ssh_bin="$2"
  local control_socket="$3"
  local destination="$4"
  local error_log="${5:-}"

  [[ -x "$timeout_bin" && -x "$ssh_bin" ]] || return 65
  [[ "$control_socket" == /* ]] || return 66
  [[ -n "$destination" && "$destination" != -* ]] || return 67
  if [[ -n "$error_log" ]]; then
    [[ "$error_log" == /* && ! -L "$error_log" &&
      (! -e "$error_log" || -f "$error_log") ]] || return 68
  fi

  # ProxyCommand=false makes a vanished control socket fail locally instead of
  # silently creating a second network connection.
  if [[ -n "$error_log" ]]; then
    "$timeout_bin" --signal=TERM --kill-after=2s 25s \
      "$ssh_bin" \
      -S "$control_socket" \
      -o ControlMaster=no \
      -o "ControlPath=$control_socket" \
      -o ProxyCommand=false \
      -o ConnectionAttempts=1 \
      -o ConnectTimeout=1 \
      "$destination" \
      /usr/bin/sudo -n /bin/bash -s 2>"$error_log"
  else
    "$timeout_bin" --signal=TERM --kill-after=2s 25s \
      "$ssh_bin" \
      -S "$control_socket" \
      -o ControlMaster=no \
      -o "ControlPath=$control_socket" \
      -o ProxyCommand=false \
      -o ConnectionAttempts=1 \
      -o ConnectTimeout=1 \
      "$destination" \
      /usr/bin/sudo -n /bin/bash -s 2>/dev/null
  fi
}

waw_probe_bounded_lightsail_ssh_master() {
  [[ "$#" -eq 4 ]] || return 64

  local timeout_bin="$1"
  local ssh_bin="$2"
  local control_socket="$3"
  local destination="$4"

  [[ -x "$timeout_bin" && -x "$ssh_bin" ]] || return 65
  [[ "$control_socket" == /* ]] || return 66
  [[ -n "$destination" && "$destination" != -* ]] || return 67

  "$timeout_bin" --signal=TERM --kill-after=2s 10s \
    "$ssh_bin" \
    -S "$control_socket" \
    -o ControlMaster=no \
    -o "ControlPath=$control_socket" \
    -o ProxyCommand=false \
    -o ConnectionAttempts=1 \
    -o ConnectTimeout=1 \
    "$destination" \
    /usr/bin/printf 'WAW_REMOTE_CHANNEL_READY\n' 2>/dev/null
}

waw_run_over_bounded_lightsail_ssh_direct() {
  [[ "$#" -eq 10 || "$#" -eq 11 ]] || return 64

  local timeout_bin="$1"
  local ssh_bin="$2"
  local identity_file="$3"
  local certificate_file="$4"
  local known_hosts_file="$5"
  local remote_user="$6"
  local remote_host="$7"
  local destination="$8"
  local error_log="$9"
  local remote_shell="${10}"
  local operation_timeout="${11:-30s}"

  [[ -x "$timeout_bin" && -x "$ssh_bin" ]] || return 65
  [[ "$identity_file" == /* && -f "$identity_file" && ! -L "$identity_file" ]] ||
    return 66
  [[ "$certificate_file" == /* && -f "$certificate_file" &&
    ! -L "$certificate_file" ]] || return 67
  [[ "$known_hosts_file" == /* && -f "$known_hosts_file" &&
    ! -L "$known_hosts_file" ]] || return 68
  [[ "$remote_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || return 69
  [[ -n "$remote_host" && "$remote_host" != -* ]] || return 70
  [[ "$destination" == "${remote_user}@${remote_host}" ]] || return 71
  [[ "$error_log" == /* && ! -L "$error_log" &&
    (! -e "$error_log" || -f "$error_log") ]] || return 72
  [[ "$remote_shell" == /bin/bash ]] || return 73
  [[ "$operation_timeout" == 30s || "$operation_timeout" == 600s ]] ||
    return 74

  "$timeout_bin" --signal=TERM --kill-after=2s "$operation_timeout" \
    "$ssh_bin" -T \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o IdentityAgent=none \
    -o "IdentityFile=$identity_file" \
    -o "CertificateFile=$certificate_file" \
    -o "UserKnownHostsFile=$known_hosts_file" \
    -o GlobalKnownHostsFile=/dev/null \
    -o StrictHostKeyChecking=yes \
    -o CheckHostIP=no \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o PreferredAuthentications=publickey \
    -o ConnectTimeout=10 \
    -o ConnectionAttempts=1 \
    -o ServerAliveInterval=5 \
    -o ServerAliveCountMax=1 \
    -o ControlMaster=no \
    -o ControlPath=none \
    -o ProxyCommand=none \
    -o LogLevel=ERROR \
    "$destination" \
    /usr/bin/sudo -n "$remote_shell" -s 2>"$error_log"
}
