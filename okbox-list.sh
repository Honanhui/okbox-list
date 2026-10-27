#!/usr/bin/env bash
# OKBOX-LIST interactive installer, version 0.4.
run_action() (
# OKBOX-LIST 0.4: single-container install/update; never delete user volumes.
set -Eeuo pipefail
umask 077

action=install
image=${OKBOX_IMAGE:-honamhui/okbox-list:0.4}
port=${OKBOX_PORT:-9978}
volume=${OKBOX_DATA_VOLUME:-okbox-list-data}
adopt=false
local_image=false
name=okbox-list
work=
backup=
was_running=false
replacement=false

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
OKBOX-LIST 0.4 安装工具（Linux，已安装 Docker）
  bash okbox-list.sh [install|update|check|status|logs|start|restart|stop] [选项]
  --local-image           使用本机已构建/加载的镜像，不拉取
  --adopt                 接管现有 docker run 容器，保留 /data、环境和网络
  --image IMAGE           默认 honamhui/okbox-list:0.4
  --port PORT             首次安装的外部端口，默认 9978
  --volume NAME           首次安装的数据卷，默认 okbox-list-data

更新已有容器时复用原数据挂载和端口；Compose 容器请用 Compose 更新。
不自动安装 Docker、不删除数据卷、不自动修改防火墙。
HELP
}
while (($#)); do
  case "$1" in
    install|update|status|logs|stop|start|restart|check) action=$1; shift ;;
    --local-image) local_image=true; shift ;;
    --adopt) adopt=true; shift ;;
    --image|--port|--volume)
      (($# >= 2)) || fail "$1 缺少参数"
      case "$1" in
        --image) image=$2 ;; --port) port=$2 ;; --volume) volume=$2 ;;
      esac
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done
[[ $(uname -s) == Linux ]] || fail '此脚本用于 Linux；Windows 可使用 Docker Compose。'
command -v docker >/dev/null || fail '请先安装 Docker。'
docker info >/dev/null 2>&1 || fail '无法连接 Docker，请使用 sudo 或检查 Docker 服务。'
[[ $port =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || fail '端口应为 1–65535。'
port=$((10#$port))
[[ $volume =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || fail '数据卷名称无效。'
[[ $image =~ ^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$ ]] || fail '镜像名称无效。'
case "$action" in
  status) docker ps -a --filter "name=^/${name}$"; exit ;;
  logs) docker logs --tail 100 -f "$name"; exit ;;
  check)
    printf '镜像：%s\n' "$image"
    docker ps -a --filter "name=^/${name}$"
    if docker container inspect "$name" >/dev/null 2>&1; then
      docker inspect -f '网络：{{.HostConfig.NetworkMode}}；运行：{{.State.Running}}；{{if .State.Health}}健康：{{.State.Health.Status}}{{end}}' "$name"
      docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}数据：{{.Type}} {{.Source}}{{end}}{{end}}' "$name"
      docker port "$name" 9978/tcp 2>/dev/null || true
      docker exec "$name" node -e "fetch('http://127.0.0.1:9978/api/health').then(r=>{if(!r.ok)throw Error();console.log('后台接口：正常')}).catch(()=>process.exit(1))" || fail '后台接口检查失败'
    else
      printf '尚未安装。\n'
    fi
    exit ;;
  start) docker start "$name"; exit ;;
  restart) docker restart "$name"; exit ;;

  stop) docker stop "$name"; printf '已停止，账号和订阅数据仍保留。\n'; exit ;;
esac

exists=false
if docker container inspect "$name" >/dev/null 2>&1; then exists=true; fi
if [[ $action == update && $exists == false ]]; then fail '未找到容器，请先安装。'; fi
if $exists; then
  compose=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name")
  [[ -z $compose || $compose == '<no value>' ]] || fail '这是 Compose 管理的容器，请用 docker compose 更新。'
  managed=$(docker inspect -f '{{index .Config.Labels "io.okbox.installer"}}' "$name")
  [[ $managed == true || $adopt == true ]] || fail '发现已有容器。使用 --adopt 明确接管，或继续用原部署方式更新。'
fi

work=$(mktemp -d -t okbox-install.XXXXXXXX)
cleanup() {
  local code=$?
  trap - EXIT
  if ((code != 0)) && [[ -n $backup ]]; then
    printf '启动失败，尝试恢复原容器；原数据卷未删除。\n' >&2
    if $replacement; then docker rm -f "$name" >/dev/null 2>&1 || true; fi
    if docker rename "$backup" "$name"; then
      if $was_running; then docker start "$name" >/dev/null || true; fi
    fi
  fi
  # Only remove this script's own mktemp directory, never /data or Docker volumes.
  [[ -n $work && -d $work && $work == */okbox-install.* ]] && rm -rf -- "$work"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if $local_image; then
  docker image inspect "$image" >/dev/null 2>&1 || fail '本机没有此镜像，请先构建或 docker load。'
else
  docker pull "$image" || fail '镜像拉取失败；镜像尚未发布时请使用 --local-image。原容器未改动。'
fi

mount="type=volume,source=$volume,target=/data"
network=bridge
env_args=(-e TZ="${TZ:-Asia/Shanghai}" -e HOST=:: -e PORT=9978 -e CONFIG_PATH=/data/config.json -e ADMIN_TOKEN="${OKBOX_ADMIN_TOKEN:-}" -e PUBLIC_BASE_URL="${OKBOX_PUBLIC_BASE_URL:-}")
if $exists; then
  mount_type=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}{{end}}{{end}}' "$name")
  mount_source=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}' "$name")
  [[ $mount_type == volume || $mount_type == bind ]] || fail '原容器没有持久化 /data，停止接管以免丢失数据。'
  [[ -n $mount_source && $mount_source != *,* ]] || fail '原数据挂载无法安全复用。'
  mount="type=$mount_type,source=$mount_source,target=/data"
  network=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$name")
  [[ $network == bridge || $network == default || $network == host ]] || fail '原容器使用自定义网络，请继续用原部署文件更新。'
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$name" > "$work/environment"
  env_args=(--env-file "$work/environment" -e HOST=::)
  if [[ $network != host ]]; then
    mapping=$(docker inspect -f '{{range (index .HostConfig.PortBindings "9978/tcp")}}{{.HostIp}}|{{.HostPort}}{{println}}{{end}}' "$name")
    [[ -n $mapping ]] || fail '原容器没有 9978 端口映射，无法安全接管。'
    mapfile -t mappings <<< "$mapping"
    port=${mappings[0]##*|}
  fi
  was_running=$(docker inspect -f '{{.State.Running}}' "$name")
fi
run_args=(--name "$name" --restart unless-stopped --label io.okbox.installer=true --mount "$mount")
if [[ $network == host ]]; then
  run_args+=(--network host)
elif $exists; then
  for entry in "${mappings[@]}"; do
    bind_ip=${entry%|*}; bind_port=${entry##*|}
    [[ $bind_port =~ ^[0-9]+$ ]] || fail '原端口映射无效。'
    if [[ $bind_ip == *:* ]]; then bind_ip="[$bind_ip]"; fi
    if [[ -n $bind_ip ]]; then run_args+=(-p "$bind_ip:$bind_port:9978"); else run_args+=(-p "$bind_port:9978"); fi
  done
else
  run_args+=(-p "$port:9978")
fi

if $exists; then
  backup="${name}-rollback-$(date +%Y%m%d%H%M%S)-$$"
  if $was_running; then docker stop -t 15 "$name" >/dev/null || fail "无法停止原容器"; fi
  if ! docker rename "$name" "$backup"; then backup=; $was_running && docker start "$name" >/dev/null; fail '无法保留旧容器。'; fi
fi
docker create "${run_args[@]}" "${env_args[@]}" "$image" >/dev/null || fail "无法创建新容器"
replacement=true
docker start "$name" >/dev/null || fail "无法启动新容器"
ready=false
for ((attempt=0; attempt<45; attempt++)); do
  if docker exec "$name" node -e "Promise.all(['http://127.0.0.1:9978/api/health','http://127.0.0.1:9988/health'].map(u=>fetch(u,{signal:AbortSignal.timeout(2000)}).then(r=>{if(!r.ok)throw Error()}))).catch(()=>process.exit(1))" >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
$ready || fail '健康检查超时。请检查容器日志。'
if [[ -n $backup ]]; then
  # Keep the stopped old container for manual rollback; it uses the same data.
  printf '已保留旧容器：%s（停止状态，不要同时启动）。\n' "$backup"
  backup=
fi
printf 'OKBOX-LIST 0.4 部署成功。\n'
docker port "$name" 9978/tcp 2>/dev/null || true
printf '后台与 OKBOX 地址：http://服务器IP:%s\n' "$port"
printf '数据挂载：%s\n' "$mount"

)
menu() {
  local choice selected_port selected_volume
  while true; do
    printf '\n========== OKBOX-LIST 0.4 ==========\n'
    printf '1. 安装服务\n2. 更新服务\n3. 配置与健康检查\n4. 查看日志\n5. 启动服务\n6. 重启服务\n7. 停止服务\n0. 退出\n'
    read -r -p '请选择 [0-7]：' choice || return 0
    case "$choice" in
      1)
        read -r -p '外部端口 [9978]：' selected_port || return 0
        read -r -p '数据卷名称 [okbox-list-data]：' selected_volume || return 0
        run_action install --port "${selected_port:-9978}" --volume "${selected_volume:-okbox-list-data}"
        ;;
      2) run_action update --adopt ;;
      3) run_action check ;;
      4) run_action logs || true ;;
      5) run_action start || true ;;
      6) run_action restart || true ;;
      7) run_action stop || true ;;
      0) return 0 ;;
      *) printf '请输入 0–7。\n' ;;
    esac
  done
}
if (($# == 0)) || [[ ${1:-} == menu ]]; then menu; else run_action "$@"; fi
