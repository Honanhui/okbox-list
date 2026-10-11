#!/usr/bin/env bash
# Exercise install/update/rollback through a fake Docker CLI, never real volumes.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
test_dir=$(mktemp -d -t okbox-installer-test.XXXXXXXX)
trap 'rm -rf -- "$test_dir"' EXIT
trap 'cat "$test_dir/output" >&2; tail -20 "$TEST_LOG" >&2' ERR
mkdir "$test_dir/bin"
cat > "$test_dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_LOG"
case "$1" in
  info) exit 0 ;;
  container) [[ $TEST_MODE != fresh ]]; exit ;;
  image) exit 0 ;;
  inspect)
    case "$3" in
      *com.docker.compose.project*) [[ $TEST_MODE != compose ]] || printf 'project\n' ;;
      *io.okbox.installer*) printf 'true\n' ;;
      *.Mounts*.Name*) printf 'old-accounts-volume\n' ;;
      *.Mounts*.Type*) [[ $TEST_MODE == missing-data ]] || printf 'volume\n' ;;
      *.NetworkMode*) printf 'bridge\n' ;;
      *.Config.Env*) printf 'ADMIN_TOKEN=synthetic-secret\nTZ=Asia/Shanghai\n' ;;
      *.PortBindings*) printf '127.0.0.1|18878\n' ;;
      *.State.Running*) printf 'true\n' ;;
      *) printf 'unexpected inspect: %s\n' "$3" >&2; exit 1 ;;
    esac ;;
  pull) [[ $TEST_MODE != pull-fails ]]; exit ;;
  exec) [[ $TEST_MODE != health-fails ]]; exit ;;
  create|start|stop|rename|rm|port|ps|logs|build) exit 0 ;;
  *) exit 1 ;;
esac
STUB
printf '#!/usr/bin/env bash\nexit 0\n' > "$test_dir/bin/sleep"
chmod +x "$test_dir/bin/"*
export PATH="$test_dir/bin:$PATH" TEST_LOG="$test_dir/docker.log"
run_case() {
  export TEST_MODE=$1
  : > "$TEST_LOG"
  shift
  bash "$root/${OKBOX_TEST_INSTALLER:-okbox-list.sh}" "$@" > "$test_dir/output" 2>&1
}
run_case fresh install --local-image
grep -q 'source=okbox-list-data,target=/data' "$TEST_LOG"
grep -q 'create .*9978:9978' "$TEST_LOG"
run_case existing update --local-image
grep -q 'source=old-accounts-volume,target=/data' "$TEST_LOG"
grep -q '127.0.0.1:18878:9978' "$TEST_LOG"
grep -q -- '--env-file' "$TEST_LOG"
! grep -q 'synthetic-secret' "$test_dir/output"
if run_case health-fails update --local-image; then echo 'Expected health failure'; exit 1; fi
grep -q '^rm -f okbox-list$' "$TEST_LOG"
grep -q '^rename okbox-list-rollback-.* okbox-list$' "$TEST_LOG"
grep -q '^start okbox-list$' "$TEST_LOG"
! grep -q 'rm .* -v\|volume rm' "$TEST_LOG"
if run_case pull-fails update; then echo 'Expected pull failure'; exit 1; fi
! grep -q '^stop ' "$TEST_LOG"
if run_case missing-data update --local-image; then echo 'Expected missing data failure'; exit 1; fi
! grep -q '^stop ' "$TEST_LOG"
if run_case compose update --local-image; then echo 'Expected Compose refusal'; exit 1; fi
! grep -q '^stop ' "$TEST_LOG"
if [[ ${OKBOX_TEST_INSTALLER:-} == okbox-list.sh ]]; then
 export TEST_MODE=fresh
 printf '3\n0\n' | bash "$root/okbox-list.sh" > "$test_dir/menu"
 grep -q '配置与健康检查' "$test_dir/menu"
 grep -q '尚未安装' "$test_dir/menu"
fi
echo 'PASS: fresh install, persistent data/port/environment reuse, health rollback, pull failure, missing data and Compose guards'
