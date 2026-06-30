# 02 · Linux 运维：apt 升级卡死排查

一个非常典型的"看起来死机、其实在等输入"的真实案例。

## 现象
`apt-get upgrade` 跑很久没反应，终端像卡死。

## 真正原因
1. 升级到某个包（如 `kdump-tools`）时，发现**配置文件被本地改过**，弹出交互式提问"保留旧配置还是用新版？"，在等人回答。
2. 输出被重定向到日志文件，终端看不到这个提问，所以**像卡死，实则在等输入**。
3. **深层坑**：命令里 `export DEBIAN_FRONTEND=noninteractive`（意为"别弹窗"），但用了 `sudo`。**`sudo` 默认重置环境变量（env_reset），把这个设置丢了**，于是又变回交互模式。

## 诊断步骤
```bash
# 1. 实时看升级日志，会看到那个提问停在那
tail -f /tmp/upg.log

# 2. 看进程树，确认卡在哪个包的配置脚本
ps -ef | grep -E 'apt-get|dpkg' | grep -v grep
# 典型：apt-get → dpkg --configure → xxx.postinst（在等 debconf 回答）
```

## 解决
```bash
# 杀掉卡死的进程（在等永远不来的输入）
sudo kill <相关PID>
# 非交互收尾，--force-confold = 保留本地配置
sudo DEBIAN_FRONTEND=noninteractive dpkg --force-confold --configure -a
sudo DEBIAN_FRONTEND=noninteractive apt-get -f install -y
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold upgrade
```

## 🔑 一劳永逸的正确写法
服务器上跑 apt，**别靠 `export`，把环境变量和选项直接挂在 sudo 命令上**：
```bash
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold upgrade
```
- `--force-confold`：保留本地配置（对应提问的"keep the local version"）
- `--force-confnew`：用维护者新配置

## 举一反三：排查"卡住"的通用思路
1. **它真卡死还是在等什么？** → 看日志、看进程状态（`R`运行/`S`睡眠/`D`不可中断IO）。
2. **在等输入？** → 交互式提问没人答（本例）。
3. **在等锁？** → `apt` 常见 `Waiting for cache lock`，被另一个 apt/unattended-upgrades 占着锁。
4. **在等 IO/网络？** → 下载慢、磁盘满（`df -h`）。
