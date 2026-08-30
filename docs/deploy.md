# 部署指南

目标：一台云服务器跑起「网页客户端 + 游戏服务器」，朋友打开网址就能联机。

## 一、买什么服务器

| 项目 | 建议 |
|---|---|
| 规格 | 2核2G 足够（这游戏单核就能跑几百人在线），各家"轻量应用服务器"新人价很低 |
| 地区 | **中国香港**（免备案，国内延迟 30-60ms，朋友局完全够用）；买国内大陆节点需要 ICP 备案（约 1-2 周） |
| 系统 | Ubuntu 22.04 LTS |
| 安全组/防火墙 | 放行端口：22（SSH）、80（网页）、443（HTTPS） |

> 推荐腾讯云/阿里云的轻量应用服务器，控制台里安全组放行端口即可。

## 二、部署步骤

### 1. 上传代码到服务器

```bash
# 本机执行（或用你顺手的 SFTP 工具）
scp -r E:/boss/paopaotang root@<服务器IP>:/opt/paopaotang
```

### 2. 一键部署

```bash
ssh root@<服务器IP>
apt-get update && apt-get install -y git   # 基础工具
bash /opt/paopaotang/deploy/setup-server.sh
```

完成后访问 `http://<服务器IP>/` 就是游戏。

### 3.（可选）绑定域名 + HTTPS

微信/抖音小游戏必须 wss + 备案域名；自己朋友网页玩用 IP 即可。

```bash
# 域名解析 A 记录指向服务器 IP 后：
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名
# 自动改好 nginx 的 443/wss 配置，客户端会自动改用 wss
```

## 三、日常运维

```bash
journalctl -u paopaotang -f        # 看游戏服务器日志
systemctl restart paopaotang       # 重启游戏服务
# 更新版本：重新 scp 代码后
cd /opt/paopaotang && npm install && npm run build -w packages/client && systemctl restart paopaotang
```

## 四、架构说明

```
玩家浏览器 ──http(s)──> nginx :80/443
                        ├─ /      → client/dist（静态文件）
                        └─ /ws    → 127.0.0.1:2567（Colyseus，systemd 守护）
```

客户端的连接地址在构建时自动适配：开发连 `ws://localhost:2567`，生产连 `同域/ws`，
所以同一份代码本地和线上都能跑。
