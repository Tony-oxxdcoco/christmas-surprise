# 圣诞互动小页面（微信可打开）

这是一个 **无需框架** 的可爱风 H5：  
**点开始 → 3D 圣诞树自动旋转 → 手划特效 → 点苹果收集 → 解锁合照 + 烟花**。  

## 1) 3 分钟定制成“你们的专属”

打开 `script.js`，修改最上面的 `CONFIG`：

- **奖励页祝福**：`greetingTitle`、`greetingSub`
- **合照文件名**：`photo`
- **收集苹果数量**：`applesToCollect`（默认 5）
- **更私密（可选）**：把 `enablePasscode` 改为 `true`，并设置 `passcode`

### 放照片

1. 新建文件夹 `photos/`
2. 把合照放进去（比如 `together.jpg`）
3. 确保 `CONFIG.photo` 里写的是对应文件名

> 建议先压缩一下合照（微信里打开更快、更丝滑）。

### 放背景音乐（可选）

1. 新建文件夹 `assets/`
2. 放入 `bgm.mp3`：`assets/bgm.mp3`

注意：微信里音频 **不能自动播放**，必须用户点“开始”后才会尝试播放，这是正常现象。

## 2) 本地预览（电脑上先看效果）

在当前目录执行：

```bash
python3 -m http.server 8000
```

浏览器打开：`http://127.0.0.1:8000/`

## 3) 变成“微信可打开的链接”（3 种方式，选一个）

你需要把整个文件夹部署到一个能访问的 **HTTPS** 地址，然后把链接发给她即可。

### 方式 1：Netlify Drop（最快，推荐）

1. 打开：**https://app.netlify.com/drop**
2. 把整个项目文件夹（包含 `index.html`、`style.css`、`script.js`、`photos/` 等）**拖到页面上**
3. 等待上传完成，会得到一个类似 `https://xxxxx.netlify.app` 的链接
4. **把这个链接发到微信**，她点开就能用

> 不需要注册账号，拖完就能用。

### 方式 2：Vercel（也很简单）

1. 打开：**https://vercel.com**
2. 注册/登录后，点击 "Add New Project"
3. 把项目文件夹拖进去，或连接 GitHub 仓库
4. 部署完成后得到一个 `https://xxxxx.vercel.app` 链接

### 方式 3：GitHub Pages（如果你有 GitHub 账号）

1. 在 GitHub 新建一个仓库
2. 把项目文件上传到仓库
3. 在仓库设置里开启 GitHub Pages
4. 得到一个 `https://你的用户名.github.io/仓库名` 的链接

---

**重要提醒**：
- ✅ 必须用 **HTTPS**（微信要求），以上方式都自动提供
- ✅ Three.js 通过 CDN 加载，需要网络能访问 CDN
- ⚠️ 如果担心 CDN 不稳定，我可以帮你改成离线版（把 Three.js 下载到本地）

## 说明：3D 渲染依赖 Three.js CDN

当前 `index.html` 通过 CDN 引入 Three.js：

- 如果她手机网络正常：直接没问题
- 如果担心 CDN 不可用：我可以帮你把 `three.min.js` 下载到本地并改为离线版（文件会比较大）

## 4) 想再加一点“更惊喜/更圣诞”的小升级（可选，10 分钟级）

- 把 `greetingSub` 改成你们的梗/祝福（越短越高级）
- 把合照换成最有“仪式感”的那张
- 把苹果数量调成 6~8（更像“收集小游戏”）


