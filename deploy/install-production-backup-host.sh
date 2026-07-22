#!/usr/bin/env bash
set -Eeuo pipefail

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq age ca-certificates curl unzip >/dev/null
install -d -m 755 /usr/share/postgresql-common/pgdg
curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
. /etc/os-release
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$VERSION_CODENAME" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client-17 >/dev/null
if [[ ! -x /usr/local/bin/aws ]]; then
  case "$(uname -m)" in
    x86_64) aws_arch=x86_64 ;;
    aarch64) aws_arch=aarch64 ;;
    *) echo unsupported_aws_cli_architecture >&2; exit 1 ;;
  esac
  aws_tmp="$(mktemp -d /tmp/waw-aws-cli.XXXXXX)"
  trap 'rm -rf -- "$aws_tmp"' EXIT
  curl --fail --silent --show-error "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" -o "$aws_tmp/awscliv2.zip"
  unzip -q "$aws_tmp/awscliv2.zip" -d "$aws_tmp"
  "$aws_tmp/aws/install" --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli
fi
getent group waw-backup >/dev/null || groupadd --system waw-backup
id waw-backup >/dev/null 2>&1 || useradd --system --gid waw-backup --home /var/lib/waw-backup --create-home --shell /usr/sbin/nologin waw-backup
usermod --gid waw-backup waw-backup
install -d -m 700 -o waw-backup -g waw-backup /var/lib/waw-backup
install -d -m 755 /usr/local/lib/waw
install -m 755 backup-postgres-to-s3.sh /usr/local/lib/waw/backup-postgres-to-s3.sh
install -m 644 waw-backup.service /etc/systemd/system/waw-backup.service
install -m 644 waw-backup.timer /etc/systemd/system/waw-backup.timer
systemctl daemon-reload
systemctl disable --now waw-backup.timer >/dev/null 2>&1 || true
rm -f /tmp/install-production-backup-host.sh /tmp/backup-postgres-to-s3.sh /tmp/waw-backup.service /tmp/waw-backup.timer
echo host_install_complete
