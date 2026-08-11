#!/bin/bash
# 服务器端部署脚本（由 GitHub Actions 上传后执行）
set -e

sudo mkdir -p /opt/points-platform
sudo tar xzf /tmp/points.tar.gz -C /opt/points-platform
cd /opt/points-platform

echo "[1/4] 安装依赖"
sudo npm ci --omit=dev --no-audit --no-fund

echo "[2/4] 配置 systemd 服务"
if [ ! -f /etc/systemd/system/points-platform.service ]; then
  sudo cp deploy/points-platform.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable points-platform
fi

echo "[3/4] 配置 nginx"
if [ ! -f /etc/nginx/sites-available/points ]; then
  sudo cp deploy/nginx-points.conf /etc/nginx/sites-available/points
  sudo ln -sf /etc/nginx/sites-available/points /etc/nginx/sites-enabled/points
  sudo nginx -t && sudo systemctl reload nginx || true
fi

echo "[4/4] 重启服务"
sudo systemctl restart points-platform
sleep 1
curl -s http://127.0.0.1:3000/api/health && echo " [deploy ok]"
