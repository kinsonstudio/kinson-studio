#!/bin/bash
cd "$(dirname "$0")"
osascript -e 'display notification "正在安装 Kinson Studio..." with title "Kinson Studio"' > /dev/null 2>&1
cp -R "Kinson Studio.app" /Applications/ 2>/dev/null
xattr -d com.apple.quarantine /Applications/Kinson\ Studio.app 2>/dev/null
osascript -e 'display notification "安装完成，正在启动..." with title "Kinson Studio"' > /dev/null 2>&1
open /Applications/Kinson\ Studio.app
