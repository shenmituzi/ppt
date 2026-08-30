#!/usr/bin/env bash
# 泡泡堂服务器一键部署（Ubuntu 22.04，root 运行）
# 前提：项目代码已上传到 /opt/paopaotang（git clone 或 scp）
set -e

APP_DIR=/opt/paopaotang

echo "==> 1/5 安装 Node.js 20 与 nginx"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx

echo "==> 2/5 安装依赖并构建客户端"
cd "$APP_DIR"
npm install
npm run build -w packages/client

echo "==> 3/5 注册 systemd 服务（开机自启 + 崩溃自动拉起）"
cp "$APP_DIR/deploy/paopaotang.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now paopaotang

echo "==> 4/5 配置 nginx"
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/paopaotang
ln -sf /etc/nginx/sites-available/paopaotang /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> 5/5 完成！"
echo "访问 http://<服务器IP>/ 即可游戏"
echo "查看游戏日志：journalctl -u paopaotang -f"
echo "有域名后申请 HTTPS：apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d 你的域名"
