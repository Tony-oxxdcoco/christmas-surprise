// 只改这里，就能变成“你们的专属”
const CONFIG = {
  // 奖励页文案（保持简单：圣诞快乐 + 一句祝福）
  greetingTitle: "愿你平安喜乐",
  greetingSub: "圣诞节快乐：这个冬天也要一直开心呀",

  // 合照文件名：把合照放到 photos/ 文件夹里，然后写文件名
  // 支持 jpg/png/webp
  photo: "1.png",

  // 游戏目标：要收集几个苹果
  applesToCollect: 5,

  // 密码（必须输入才能进入）
  passcode: "20250307",
};

const $ = (sel) => document.querySelector(sel);

const elStart = $("#start");
const elTree = $("#tree");
const elReward = $("#reward");

const btnStart = $("#btnStart");
const btnMute = $("#btnMute");
const btnTreeReset = $("#btnTreeReset");
const btnBack = $("#btnBack");
const btnFireworks = $("#btnFireworks");

const treeStatusEl = $("#treeStatus");
const canvas = $("#treeCanvas");

const greetingTitleEl = $("#greetingTitle");
const greetingSubEl = $("#greetingSub");
const photoEl = $("#photo");
const photoFallbackEl = $("#photoFallback");

const fxLayer = $("#fx");
const snowLayer = $("#snow");
const bgm = $("#bgm");

let isMuted = false;
let celebrateTimer = null;

// ========= 小工具 =========
function show(el) {
  if (!el) return;
  el.classList.remove("is-hidden");
  el.setAttribute("aria-hidden", "false");
}
function hide(el) {
  if (!el) return;
  el.classList.add("is-hidden");
  el.setAttribute("aria-hidden", "true");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safePlayAudio() {
  if (!bgm) return;
  if (isMuted) return;
  // 微信里音频必须由用户手势触发；所以只在"点开始/点按钮"后调用
  const p = bgm.play();
  if (p && typeof p.catch === "function") {
    p.catch((err) => {
      // 如果本地文件加载失败，会自动尝试备用链接
      console.log("音频加载失败，尝试备用链接");
    });
  }
}
function safePauseAudio() {
  if (!bgm) return;
  try {
    bgm.pause();
  } catch {}
}

// ========= 可爱氛围：雪花 + 粒子 =========
function spawnFlake() {
  const flake = document.createElement("div");
  flake.className = "flake";
  const left = Math.random() * 100;
  const size = 5 + Math.random() * 8;
  const dur = 5200 + Math.random() * 6500;
  const drift = (Math.random() - 0.5) * 140;
  flake.style.left = `${left}vw`;
  flake.style.width = `${size}px`;
  flake.style.height = `${size}px`;
  flake.style.animationDuration = `${dur}ms`;
  flake.style.setProperty("--drift", `${drift}px`);
  flake.style.opacity = String(0.5 + Math.random() * 0.45);
  snowLayer.appendChild(flake);
  setTimeout(() => flake.remove(), dur + 300);
}
function startSnow() {
  // 更密集的雪花：初始多飘一些，间隔更短
  for (let i = 0; i < 25; i++) setTimeout(spawnFlake, i * 180);
  setInterval(spawnFlake, 280);
}

function popHeart(x, y) {
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = Math.random() < 0.5 ? "❤" : "✨";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function fireworksBurst(x, y, strength = 1) {
  const colors = ["#ff5fa2", "#22c7a9", "#ffd166", "#6a7dff", "#ff86bc"];
  const n = Math.round(18 * strength);
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    const a = (Math.PI * 2 * i) / n + (Math.random() * 0.4 - 0.2);
    const r = (30 + Math.random() * 55) * strength;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.setProperty("--dx", `${Math.cos(a) * r}px`);
    s.style.setProperty("--dy", `${Math.sin(a) * r}px`);
    fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

function swipeTrail(x, y) {
  // 轻一点的“光带粒子”，更像手划过去的效果
  const colors = ["#ffd166", "#ff86bc", "#22c7a9", "#ffffff"];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    const dx = (Math.random() - 0.5) * 70;
    const dy = (Math.random() - 0.5) * 70;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.setProperty("--dx", `${dx}px`);
    s.style.setProperty("--dy", `${dy}px`);
    s.style.opacity = "0.85";
    fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

// ========= 奖励：合照 + 祝福 =========
function renderPhoto() {
  const name = CONFIG.photo;
  if (!name) {
    if (photoEl) photoEl.style.display = "none";
    if (photoFallbackEl) photoFallbackEl.classList.remove("is-hidden");
    return;
  }

  if (!photoEl) return;
  
  // 检测当前路径，确定正确的照片路径
  const isGitHubPages = window.location.hostname.includes('github.io');
  const pathname = window.location.pathname;
  let basePath = './photos/';
  
  // 如果是 GitHub Pages，可能需要添加仓库名
  if (isGitHubPages && pathname.includes('/christmas-surprise')) {
    basePath = './photos/';  // 相对路径应该可以工作
  }
  
  const photoPath = basePath + name;
  
  photoEl.style.display = "block";
  if (photoFallbackEl) photoFallbackEl.classList.add("is-hidden");
  
  // 清除之前的错误处理，避免冲突
  photoEl.onerror = null;
  photoEl.onload = null;
  
  // 设置图片源
  photoEl.src = photoPath;
  console.log("尝试加载照片，路径:", photoPath);
  
  // 添加加载错误处理
  let retryCount = 0;
  const maxRetries = 3;
  const pathsToTry = [
    photoPath,  // 原始路径
    `photos/${name}`,  // 不带 ./
    `/christmas-surprise/photos/${name}`,  // GitHub Pages 绝对路径
  ];
  
  photoEl.onerror = () => {
    retryCount++;
    console.log(`照片加载失败，尝试 ${retryCount}/${maxRetries}，当前路径: ${photoEl.src}`);
    
    if (retryCount < pathsToTry.length) {
      // 尝试下一个路径
      photoEl.src = pathsToTry[retryCount];
    } else {
      // 所有路径都失败
      photoEl.onerror = null;
      photoEl.style.display = "none";
      if (photoFallbackEl) {
        photoFallbackEl.classList.remove("is-hidden");
        const subEl = photoFallbackEl.querySelector('.fallbackSub');
        if (subEl) {
          subEl.textContent = `无法加载照片。已尝试路径: ${pathsToTry.join(', ')}`;
        }
      }
      console.error("照片加载失败，已尝试所有路径:", pathsToTry);
    }
  };
  
  photoEl.onload = () => {
    // 照片加载成功
    console.log("✅ 照片加载成功:", photoEl.src);
    if (photoFallbackEl) photoFallbackEl.classList.add("is-hidden");
    photoEl.style.display = "block";
    photoEl.onerror = null;  // 清除错误处理，避免后续触发
  };
}

function startCelebration() {
  if (celebrateTimer) {
    clearInterval(celebrateTimer);
    celebrateTimer = null;
  }
  let bursts = 0;
  celebrateTimer = setInterval(() => {
    bursts += 1;
    fireworksBurst(
      window.innerWidth * (0.2 + Math.random() * 0.6),
      window.innerHeight * (0.16 + Math.random() * 0.46),
      1.1
    );
    spawnFlake();
    spawnFlake();
    if (bursts >= 7) {
      clearInterval(celebrateTimer);
      celebrateTimer = null;
    }
  }, 220);
}

async function unlockReward() {
  document.body.classList.remove("is-tree-mode");
  hide(elTree);
  hide(elStart);
  show(elReward);

  if (greetingTitleEl) greetingTitleEl.textContent = CONFIG.greetingTitle || "圣诞节快乐";
  if (greetingSubEl) greetingSubEl.textContent = CONFIG.greetingSub || "";
  
  // 立即开始加载照片，不等待
  renderPhoto();
  
  // 如果照片还没加载，快速重试
  setTimeout(() => {
    if (photoEl && (!photoEl.complete || photoEl.naturalWidth === 0)) {
      console.log("照片可能未加载，重试...");
      renderPhoto();
    }
  }, 200);
  
  startCelebration();
}

// ========= 页面流程 =========
function checkPasscode() {
  const input = window.prompt("输入密码进入（提示：今年的生日日期？）");
  if (!input) return false;
  return input === CONFIG.passcode;
}

function goToTree() {
  hide(elStart);
  hide(elReward);
  show(elTree);
  document.body.classList.add("is-tree-mode");
}

// ========= 3D 圣诞树（Three.js） =========
let three = {
  ready: false,
  renderer: null,
  scene: null,
  camera: null,
  treeGroup: null,
  apples: [],
  raycaster: null,
  pointer: null,
  animId: null,
  collected: 0,
  isDragging: false,
  dragLastX: 0,
  dragVelocity: 0,
  downX: 0,
  downY: 0,
  moved: 0,
  lastTrailAt: 0,
  snowParticles: null,  // 下雪粒子系统
  snowGeometry: null,
  snowMaterial: null,
};

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function setTreeStatus() {
  const goal = Math.max(1, CONFIG.applesToCollect || 5);
  if (treeStatusEl) treeStatusEl.textContent = `收集苹果：${three.collected}/${goal}`;
}

function resetApples() {
  three.collected = 0;
  // 重新生成苹果：简单、稳定
  if (three.treeGroup && three.apples.length) {
    three.apples.forEach((a) => {
      try {
        three.treeGroup.remove(a);
        a.geometry?.dispose?.();
        a.material?.dispose?.();
      } catch {}
    });
  }
  three.apples = [];
  if (three.ready) spawnApples();
  setTreeStatus();
}

function spawnApples() {
  const THREE = window.THREE;
  const goal = Math.max(1, CONFIG.applesToCollect || 5);
  const treeScale = 0.5;  // 与树的缩放保持一致
  
  // 改进苹果外观：更可爱、更精致
  // 使用稍微椭圆的形状，更像真实苹果
  const geo = new THREE.SphereGeometry(0.12 * treeScale, 32, 32);
  
  for (let i = 0; i < goal; i++) {
    // 每个苹果稍微不同，更有层次感
    const appleGroup = new THREE.Group();
    
    // 主苹果体（稍微压扁，更像真实苹果）
    const apple = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xff4d6d,  // 更鲜艳的红色
        roughness: 0.3,
        metalness: 0.2,
        emissive: 0xff1a3d,
        emissiveIntensity: 0.3,
      })
    );
    apple.scale.set(1, 1.1, 1);  // 稍微拉长，更像苹果
    appleGroup.add(apple);
    
    // 添加高光点（让苹果更立体）
    const highlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * treeScale, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.6,
      })
    );
    highlight.position.set(0.04 * treeScale, 0.06 * treeScale, 0.05 * treeScale);
    appleGroup.add(highlight);
    
    // 添加叶子（小装饰）
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.02 * treeScale, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x4a7c59,
        roughness: 0.6,
        metalness: 0.1,
      })
    );
    leaf.scale.set(1, 0.3, 1);
    leaf.position.set(0, 0.14 * treeScale, 0);
    appleGroup.add(leaf);
    
    appleGroup.userData.isApple = true;
    appleGroup.userData.collected = false;
    appleGroup.userData.pop = 0;
    
    // 增大碰撞体积：添加一个更大的不可见碰撞体
    const hitBox = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 * treeScale, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    appleGroup.add(hitBox);
    appleGroup.userData.hitBox = hitBox;

    // 随机放在树上：越往上半径越小，但确保在可见位置（配合缩小的树，scale=0.5）
    const baseY = 0.7 * treeScale;  // 缩小后的基础高度
    const heightRange = 1.6 * treeScale;  // 缩小后的高度范围
    const y = baseY + Math.random() * heightRange;
    const t = (y - baseY) / heightRange; // 0..1
    const radius = 1.15 * treeScale * (1 - t) * 0.98;  // 稍微外移，配合缩小
    const ang = Math.random() * Math.PI * 2;
    appleGroup.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);

    // 确保苹果在树外，更容易点到
    appleGroup.position.multiplyScalar(1.1);
    appleGroup.rotation.set(
      Math.random() * 0.3 - 0.15,
      Math.random() * Math.PI * 2,
      Math.random() * 0.3 - 0.15
    );

    three.apples.push(appleGroup);
    three.treeGroup.add(appleGroup);
  }
}

function buildTree() {
  const THREE = window.THREE;

  const group = new THREE.Group();
  
  // 整体缩放因子：让树变小（0.5 = 缩小到50%，更精致）
  const scale = 0.5;

  // 树干（更精致，有纹理感，缩小）
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 0.65 * scale, 24),
    new THREE.MeshStandardMaterial({ 
      color: 0x6b4423, 
      roughness: 0.85,
      metalness: 0.1
    })
  );
  trunk.position.y = 0.32 * scale;
  trunk.castShadow = true;
  group.add(trunk);

  // 树叶层（5层，更精致有层次，使用更自然的绿色渐变，缩小）
  const layers = [
    { y: 0.85 * scale, r: 1.35 * scale, h: 1.3 * scale, c: 0x2ecf9f },  // 底层最大
    { y: 1.35 * scale, r: 1.15 * scale, h: 1.1 * scale, c: 0x26c08f },
    { y: 1.75 * scale, r: 0.95 * scale, h: 0.95 * scale, c: 0x1eb17f },
    { y: 2.1 * scale, r: 0.75 * scale, h: 0.8 * scale, c: 0x16a26f },
    { y: 2.4 * scale, r: 0.55 * scale, h: 0.65 * scale, c: 0x0e935f },  // 顶层最小
  ];
  
  layers.forEach((layer, idx) => {
    // 每层用多个小锥体组合，更有层次感
    const layerGroup = new THREE.Group();
    
    // 主锥体
    const main = new THREE.Mesh(
      new THREE.ConeGeometry(layer.r, layer.h, 36),
      new THREE.MeshStandardMaterial({
        color: layer.c,
        roughness: 0.35,
        metalness: 0.08,
        emissive: layer.c,
        emissiveIntensity: 0.12,
      })
    );
    main.position.y = 0;
    main.castShadow = true;
    layerGroup.add(main);
    
    // 添加一些小的装饰性分支（让树更自然）
    if (idx < 3) {
      for (let i = 0; i < 3; i++) {
        const branch = new THREE.Mesh(
          new THREE.ConeGeometry(layer.r * 0.3, layer.h * 0.4, 24),
          new THREE.MeshStandardMaterial({
            color: layer.c,
            roughness: 0.4,
            metalness: 0.05,
          })
        );
        const angle = (Math.PI * 2 * i) / 3;
        branch.position.set(
          Math.cos(angle) * layer.r * 0.6,
          layer.h * 0.2,
          Math.sin(angle) * layer.r * 0.6
        );
        branch.rotation.z = Math.sin(angle) * 0.3;
        layerGroup.add(branch);
      }
    }
    
    layerGroup.position.y = layer.y;
    group.add(layerGroup);
  });

  // 星星（更精致，多层设计，缩小）
  const starGroup = new THREE.Group();
  
  // 外层大星星
  const starOuter = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2 * scale, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffe066,
      roughness: 0.1,
      metalness: 0.8,
      emissive: 0xffe066,
      emissiveIntensity: 1.0,
    })
  );
  starGroup.add(starOuter);
  
  // 内层小星星（旋转）
  const starInner = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12 * scale, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.9,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
    })
  );
  starGroup.add(starInner);
  
  starGroup.position.y = 2.75 * scale;
  starGroup.userData.isStar = true;
  group.add(starGroup);

  // 彩灯串（更精致，有闪烁感，缩小）
  const bulbGeo = new THREE.SphereGeometry(0.07 * scale, 20, 20);
  const bulbColors = [
    0xff86bc, 0x22c7a9, 0xffd166, 0x6a7dff, 
    0xff5fa2, 0xffffff, 0xffb3d9, 0x4dd0e1
  ];
  
  // 彩灯分布更均匀，更有设计感（缩小）
  for (let layer = 0; layer < 5; layer++) {
    const layerY = (0.9 + layer * 0.4) * scale;
    const layerRadius = 1.2 * scale * (1 - layer * 0.15);
    const bulbsPerLayer = 8 + layer * 2;
    
    for (let i = 0; i < bulbsPerLayer; i++) {
      const ang = (Math.PI * 2 * i) / bulbsPerLayer;
      const col = bulbColors[Math.floor(Math.random() * bulbColors.length)];
      const bulb = new THREE.Mesh(
        bulbGeo,
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.15,
          metalness: 0.4,
          emissive: col,
          emissiveIntensity: 0.7,
        })
      );
      bulb.position.set(
        Math.cos(ang) * layerRadius,
        layerY + (Math.random() - 0.5) * 0.15,
        Math.sin(ang) * layerRadius
      );
      group.add(bulb);
    }
  }

  // 装饰球（更精致，有高光，缩小）
  const ornamentGeo = new THREE.SphereGeometry(0.1 * scale, 24, 24);
  const ornamentColors = [
    { c: 0xff3b6f, m: 0.7 },  // 红色
    { c: 0xffd166, m: 0.8 },  // 金色
    { c: 0x6a7dff, m: 0.6 },  // 蓝色
    { c: 0x22c7a9, m: 0.65 }, // 青色
  ];
  
  for (let i = 0; i < 15; i++) {
    const y = (1.0 + Math.random() * 1.5) * scale;
    const t = (y / scale - 1.0) / 1.5;
    const radius = 1.1 * scale * (1 - t) * 0.97;
    const ang = Math.random() * Math.PI * 2;
    const ornamentData = ornamentColors[Math.floor(Math.random() * ornamentColors.length)];
    
    const ornament = new THREE.Mesh(
      ornamentGeo,
      new THREE.MeshStandardMaterial({
        color: ornamentData.c,
        roughness: 0.2,
        metalness: ornamentData.m,
        emissive: ornamentData.c,
        emissiveIntensity: 0.3,
      })
    );
    ornament.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
    ornament.castShadow = true;
    group.add(ornament);
  }

  // 底座（雪地，更精致，缩小）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.2 * scale, 64),
    new THREE.MeshStandardMaterial({ 
      color: 0xf5f9fa,
      roughness: 0.95,
      metalness: 0.0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02 * scale;
  ground.receiveShadow = true;
  group.add(ground);

  group.position.y = -0.05 * scale;
  return group;
}

function initThreeOnce() {
  const THREE = window.THREE;
  if (!THREE) return false;
  if (!canvas) return false;
  if (three.ready) return true;
  if (!hasWebGL()) return false;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  // 背景色：淡蓝色天空，更有下雪的氛围
  scene.background = new THREE.Color(0xe8f4f8);
  scene.fog = new THREE.Fog(0xe8f4f8, 6, 14);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 40);
  // 调整相机位置，让缩小的树看起来更合适（树现在是0.5倍）
  camera.position.set(0, 0.8, 2.8);
  camera.lookAt(0, 0.6, 0);

  // 光照：柔和、偏节日
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfefff, 0.55);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(2.2, 4.6, 2.8);
  scene.add(dir);
  const pink = new THREE.PointLight(0xff86bc, 0.8, 12);
  pink.position.set(-2.2, 2.4, 2.2);
  scene.add(pink);
  const mint = new THREE.PointLight(0x22c7a9, 0.65, 12);
  mint.position.set(2.4, 2.1, -2.2);
  scene.add(mint);

  const treeGroup = buildTree();
  scene.add(treeGroup);

  // 3D 下雪效果（粒子系统）
  const snowCount = 800;
  const snowGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(snowCount * 3);
  const velocities = new Float32Array(snowCount);
  
  for (let i = 0; i < snowCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 30;  // x
    positions[i3 + 1] = Math.random() * 20 + 5;    // y (从上方开始)
    positions[i3 + 2] = (Math.random() - 0.5) * 30; // z
    velocities[i] = 0.02 + Math.random() * 0.03;    // 下落速度
  }
  
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const snowMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const snowParticles = new THREE.Points(snowGeometry, snowMaterial);
  snowParticles.userData.velocities = velocities;  // 保存速度数组
  scene.add(snowParticles);

  three.renderer = renderer;
  three.scene = scene;
  three.camera = camera;
  three.treeGroup = treeGroup;
  three.raycaster = new THREE.Raycaster();
  three.pointer = new THREE.Vector2();
  three.snowParticles = snowParticles;
  three.snowGeometry = snowGeometry;
  three.snowMaterial = snowMaterial;
  three.ready = true;

  resetApples();
  setTreeStatus();

  window.addEventListener("resize", () => {
    if (!three.ready) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    three.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    three.renderer.setSize(w, h, false);
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
  });

  // 触控交互（拖动旋转 + 滑动特效 + 点击苹果）
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerup", onPointerUp, { passive: true });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: true });

  return true;
}

function raycastApple(clientX, clientY) {
  const THREE = window.THREE;
  if (!three.ready) return null;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  three.pointer.set(x, y);
  three.raycaster.setFromCamera(three.pointer, three.camera);

  // 改进：检测所有苹果及其子对象（包括碰撞体），并找到最近的
  const hits = three.raycaster.intersectObjects(three.apples, true);
  if (!hits.length) return null;
  
  // 找到实际是苹果的对象（不是碰撞体）
  for (const hit of hits) {
    let obj = hit.object;
    // 向上查找，找到真正的苹果对象
    while (obj && !obj.userData.isApple) {
      obj = obj.parent;
    }
    if (obj && obj.userData.isApple && !obj.userData.collected) {
      return obj;
    }
  }
  return null;
}

function collectApple(apple, clientX, clientY) {
  if (!apple || !apple.userData || !apple.userData.isApple) return;
  if (apple.userData.collected) return;
  apple.userData.collected = true;
  apple.userData.pop = 1;
  apple.visible = false;
  three.collected += 1;
  setTreeStatus();
  popHeart(clientX, clientY);
  fireworksBurst(clientX, clientY, 0.9);
  safePlayAudio();

  const goal = Math.max(1, CONFIG.applesToCollect || 5);
  if (three.collected >= goal) {
    // 通关：稍微停一下再跳奖励页，更有“揭晓”感
    setTimeout(() => unlockReward(), 420);
  }
}

function onPointerDown(e) {
  three.isDragging = true;
  three.dragLastX = e.clientX;
  three.dragVelocity = 0;
  three.downX = e.clientX;
  three.downY = e.clientY;
  three.moved = 0;
}

function onPointerMove(e) {
  if (!three.isDragging) return;
  const dx = e.clientX - three.dragLastX;
  three.dragLastX = e.clientX;
  three.moved += Math.abs(dx);

  if (three.treeGroup) {
    three.treeGroup.rotation.y += dx * 0.01;
    three.dragVelocity = dx * 0.0009;
  }

  const now = performance.now();
  if (now - three.lastTrailAt > 70 && Math.abs(dx) > 2) {
    swipeTrail(e.clientX, e.clientY);
    three.lastTrailAt = now;
  }
}

function onPointerUp(e) {
  const moved = three.moved;
  three.isDragging = false;

  // 轻点：射线拾取苹果
  if (moved < 8) {
    const apple = raycastApple(e.clientX, e.clientY);
    if (apple) collectApple(apple, e.clientX, e.clientY);
  }
}

function startRenderLoop() {
  if (!three.ready) return;
  if (three.animId) cancelAnimationFrame(three.animId);

  const tick = () => {
    three.animId = requestAnimationFrame(tick);
    if (!three.ready) return;

    // 自动旋转 + 惯性
    if (three.treeGroup) {
      if (!three.isDragging) {
        three.treeGroup.rotation.y += 0.004 + three.dragVelocity;
        three.dragVelocity *= 0.94;
      }
    }

    // 让星星微微呼吸和旋转
    const star = three.treeGroup?.children?.find?.((o) => o.userData?.isStar);
    if (star) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 2.2) * 0.06;
      star.scale.setScalar(s);
      star.rotation.y = t * 0.5;  // 缓慢旋转
    }

    // 3D 下雪动画（修复bug）
    if (three.snowParticles && three.snowGeometry) {
      const positions = three.snowGeometry.attributes.position.array;
      const velocities = three.snowParticles.userData.velocities;
      const time = performance.now() * 0.001;
      
      if (velocities && positions) {
        for (let i = 0; i < positions.length; i += 3) {
          const idx = i / 3;
          const vel = velocities[idx] || 0.025;
          
          // 下落
          positions[i + 1] -= vel;
          
          // 轻微左右飘动（更自然）
          positions[i] += Math.sin(time * 0.5 + idx * 0.1) * 0.003;
          positions[i + 2] += Math.cos(time * 0.4 + idx * 0.1) * 0.002;
          
          // 如果落到地面以下，重置到上方
          if (positions[i + 1] < -2) {
            positions[i + 1] = 15 + Math.random() * 5;
            positions[i] = (Math.random() - 0.5) * 30;
            positions[i + 2] = (Math.random() - 0.5) * 30;
          }
        }
        
        three.snowGeometry.attributes.position.needsUpdate = true;
      }
    }

    three.renderer.render(three.scene, three.camera);
  };
  tick();
}

// ========= 事件绑定 =========
btnStart.addEventListener("click", () => {
  if (!checkPasscode()) {
    alert("密码不对哦～再想想。");
    return;
  }
  safePlayAudio();
  goToTree();

  if (!window.THREE) {
    alert("3D 组件加载失败（Three.js）。请确认网络可访问 CDN，或我可以帮你改成本地离线版。");
    unlockReward();
    return;
  }
  if (!initThreeOnce()) {
    alert("当前设备可能不支持 WebGL（3D 渲染）。我先给你展示合照页。");
    unlockReward();
    return;
  }
  resetApples();
  startRenderLoop();
});

btnMute.addEventListener("click", () => {
  isMuted = !isMuted;
  btnMute.textContent = `声音：${isMuted ? "关" : "开"}`;
  btnMute.setAttribute("aria-pressed", isMuted ? "true" : "false");
  if (isMuted) safePauseAudio();
  else safePlayAudio();
});

btnTreeReset.addEventListener("click", () => resetApples());

btnBack.addEventListener("click", () => {
  // 回到树继续玩
  hide(elReward);
  goToTree();
  if (three.ready) resetApples();
});

btnFireworks.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  safePlayAudio();
  // 在屏幕正中央放烟花
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  fireworksBurst(centerX, centerY, 2.0);
  // 在中央周围放多个烟花，形成烟花群
  setTimeout(() => fireworksBurst(centerX + 60, centerY - 40, 1.5), 100);
  setTimeout(() => fireworksBurst(centerX - 60, centerY - 40, 1.5), 200);
  setTimeout(() => fireworksBurst(centerX + 40, centerY + 50, 1.3), 150);
  setTimeout(() => fireworksBurst(centerX - 40, centerY + 50, 1.3), 250);
});

// 全屏点击：冒小心心（在 3D 树界面会更克制：避免覆盖太多）
document.addEventListener("pointerdown", (e) => {
  if (elTree && !elTree.classList.contains("is-hidden")) return;
  popHeart(e.clientX, e.clientY);
});

// 预加载照片（加速显示）
function preloadPhoto() {
  const name = CONFIG.photo;
  if (!name || !photoEl) return;
  
  // 提前创建图片对象并加载
  const img = new Image();
  const paths = [
    `./photos/${name}`,
    `photos/${name}`,
    `/christmas-surprise/photos/${name}`,
  ];
  
  let currentPathIndex = 0;
  img.onload = () => {
    console.log("照片预加载成功:", img.src);
    // 预加载成功后，直接设置到显示元素
    if (photoEl) {
      photoEl.src = img.src;
    }
  };
  
  img.onerror = () => {
    currentPathIndex++;
    if (currentPathIndex < paths.length) {
      img.src = paths[currentPathIndex];
    }
  };
  
  // 开始加载第一个路径
  img.src = paths[0];
}

// 初始化
startSnow();
setTreeStatus();
preloadPhoto();  // 页面加载时就开始预加载照片



