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

  // 是否启用“暗号”进入（更私密，发链接不怕别人点开）
  enablePasscode: false,
  passcode: "20250307",
};

// 线上排查用：打开控制台看这个版本号，就能确认是不是最新代码
//（发布到 GitHub Pages 后，如果还是旧版本，说明页面还没更新或被缓存）
window.__CHRISTMAS_SURPRISE_BUILD__ = "2025-12-30h";
console.log("[christmas-surprise] build:", window.__CHRISTMAS_SURPRISE_BUILD__);

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

const fxLayer = $("#uiFx") || $("#fx");
const fxCanvas = $("#fxCanvas");
const snowLayer = $("#snow");
const bgm = $("#bgm");

let isMuted = false;
let celebrateTimer = null;
const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const IS_MOBILE =
  typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
const DEVICE_MEMORY_GB = typeof navigator !== "undefined" ? Number(navigator.deviceMemory || 0) : 0;
const CPU_CORES = typeof navigator !== "undefined" ? Number(navigator.hardwareConcurrency || 0) : 0;
const LOW_POWER =
  prefersReducedMotion ||
  IS_MOBILE ||
  (DEVICE_MEMORY_GB && DEVICE_MEMORY_GB <= 4) ||
  (CPU_CORES && CPU_CORES <= 4);
// 性能优先：默认就锁 30fps（对大多数设备流畅度够用，但能显著降 CPU/GPU 占用）
const TARGET_FPS = LOW_POWER ? 24 : 30;

let fw = null;
let ambientFireworksTimer = null;
let snowTimer = null;
let snowEnabled = true;

// ========= 背景音乐兜底（bgm.mp3 缺失时自动用 satisfaction.mp3） =========
function setupBgmFallback() {
  if (!bgm) return;
  const primary = "./assets/bgm.mp3";
  const fallback = "./assets/satisfaction.mp3";

  function use(src) {
    try {
      bgm.src = src;
      bgm.load();
      console.log("[christmas-surprise] bgm src:", src);
    } catch {}
  }

  // 尽量不触发 404：先用 HEAD 探测 bgm.mp3 是否存在
  (async () => {
    try {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = setTimeout(() => ctl?.abort?.(), 1800);
      const res = await fetch(primary, { method: "HEAD", signal: ctl?.signal });
      clearTimeout(t);
      if (res && res.ok) use(primary);
      else use(fallback);
    } catch {
      use(fallback);
    }
  })();

  // 如果资源加载失败，自动切到兜底
  bgm.addEventListener(
    "error",
    () => {
      if (bgm.src && bgm.src.includes("satisfaction.mp3")) return;
      use(fallback);
    },
    { passive: true }
  );
}

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
  const p = bgm.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}
function safePauseAudio() {
  if (!bgm) return;
  try {
    bgm.pause();
  } catch {}
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ========= 赛博烟花（Canvas 粒子引擎） =========
class FireworksEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.("2d", { alpha: true, desynchronized: true });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    this.rockets = [];
    this.particles = [];
    this.rings = [];
    this.blooms = [];

    this.running = false;
    this.raf = 0;
    this.lastT = 0;
    this.idleFor = 0;

    // 赛博朋克常用霓虹色（用 hue 更方便做渐变）
    this.hues = [185, 205, 245, 275, 305, 330, 45, 120]; // cyan / blue / purple / magenta / gold / neon-green

    // 性能优先：手机/低配设备自动降级
    this.quality = prefersReducedMotion ? 0.50 : LOW_POWER ? 0.62 : 1.0;

    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    // 烟花层 GPU 负担也不小：把像素比上限压低，肉眼几乎看不出但性能提升明显
    const dprCap = LOW_POWER ? 1.0 : 1.25;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ensureRunning() {
    if (this.running) return;
    if (!this.ctx) return;
    this.running = true;
    this.lastT = performance.now();
    this.idleFor = 0;
    const tick = (t) => {
      if (!this.running) return;
      const dt = clamp((t - this.lastT) / 1000, 0, 0.033);
      this.lastT = t;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastT = 0;
  }

  step(dt) {
    const ctx = this.ctx;
    if (!ctx) return;

    const hasAny =
      this.rockets.length || this.particles.length || this.rings.length || this.blooms.length;
    if (!hasAny) {
      this.idleFor += dt;
      // 空闲一会儿就停掉 rAF，省电（下一次发烟花会自动唤醒）
      if (this.idleFor > 0.45) this.stop();
      return;
    }
    this.idleFor = 0;

    // 用 destination-out “擦除 alpha”，不往底层叠黑色（适合透明 overlay 做拖尾）
    ctx.globalCompositeOperation = "destination-out";
    // 更长的拖尾、更“亮”的观感（同时通过减少粒子数避免变密）
    ctx.fillStyle = `rgba(0,0,0,${0.16})`;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.globalCompositeOperation = "lighter";

    // blooms（爆点瞬闪）
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      b.life += dt;
      const t = b.life / b.ttl;
      if (t >= 1) {
        this.blooms.splice(i, 1);
        continue;
      }
      const a = (1 - t) * (1 - t);
      const r = lerp(b.r0, b.r1, t);
      ctx.save();
      ctx.shadowBlur = r * 1.15;
      ctx.shadowColor = `hsla(${b.hue},100%,60%,${a})`;
      ctx.fillStyle = `hsla(${b.hue},100%,68%,${a * 0.72})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // rings（冲击波环）
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r0 = this.rings[i];
      r0.life += dt;
      const t = r0.life / r0.ttl;
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      r0.r += r0.vr * dt;
      const a = (1 - t) * 0.62;
      const lw = Math.max(0.8, r0.w * (1 - t));
      ctx.save();
      ctx.lineWidth = lw;
      ctx.shadowBlur = lw * 11;
      ctx.shadowColor = `hsla(${r0.hue},100%,60%,${a})`;
      ctx.strokeStyle = `hsla(${r0.hue},100%,60%,${a})`;
      ctx.beginPath();
      ctx.arc(r0.x, r0.y, r0.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // rockets（上升火箭 + 拖尾）
    const g = 720; // px/s^2
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life += dt;
      r.px = r.x;
      r.py = r.y;

      r.vx *= Math.pow(0.985, dt * 60);
      r.vy += g * dt * 0.06;
      r.x += r.vx * dt;
      r.y += r.vy * dt;

      // 拖尾粒子：细、亮、带一点抖动（更赛博）
      // 不做太密：减少数量，但让每条更亮、更长
      const trailN = Math.max(1, Math.round(2 * this.quality));
      for (let k = 0; k < trailN; k++) {
        this.particles.push({
          kind: "trail",
          x: r.x + rand(-1.2, 1.2),
          y: r.y + rand(-1.2, 1.2),
          px: r.px,
          py: r.py,
          vx: rand(-10, 10),
          vy: rand(20, 60),
          life: 0,
          ttl: rand(0.22, 0.40),
          size: rand(1.25, 2.05),
          hue: r.hue,
        });
      }

      const reachTarget = r.y <= r.ty || r.life >= r.ttl;
      if (reachTarget) {
        this.rockets.splice(i, 1);
        this.explode(r.x, r.y, r.strength, r.hue);
      }
    }

    // particles（爆炸火花/星尘/拖尾）
    const maxParticles = Math.floor(1400 * this.quality);
    if (this.particles.length > maxParticles) {
      // 保底：超量时丢掉最老的一段（防止手机直接卡死）
      this.particles.splice(0, this.particles.length - maxParticles);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.ttl;
      if (t >= 1) {
        this.particles.splice(i, 1);
        continue;
      }

      p.px = p.x;
      p.py = p.y;

      const drag = p.kind === "trail" ? 0.90 : 0.985;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);

      // 重力让火花更像“烟花”
      const gg = p.kind === "glitter" ? 680 : 920;
      p.vy += gg * dt * 0.35;

      // 星尘一点“电流抖动”
      if (p.kind === "glitter") {
        p.vx += rand(-26, 26) * dt;
        p.vy += rand(-18, 18) * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const a = (1 - t) * (1 - t);
      const hue = p.hue;

      // 线段拖影 + 小点（更接近视频那种“亮 + 拖尾”）
      const lw = p.kind === "trail" ? p.size : Math.max(1, p.size * 1.15);
      ctx.save();
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.shadowBlur = lw * (p.kind === "trail" ? 11 : 13);
      ctx.shadowColor = `hsla(${hue},100%,60%,${a})`;
      ctx.strokeStyle = `hsla(${hue},100%,66%,${a})`;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // 核心亮点（赛博“电浆”感）
      ctx.fillStyle = `hsla(${hue},100%,72%,${a * 0.9})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 偶尔加一两条“扫描线”式的霓虹闪烁（很轻，增加赛博味）
    if (!LOW_POWER && Math.random() < 0.03 * this.quality) {
      const y = rand(this.h * 0.08, this.h * 0.55);
      const hue = pick(this.hues);
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsla(${hue},100%,60%,0.55)`;
      ctx.strokeStyle = `hsla(${hue},100%,60%,0.35)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y + rand(-2, 2));
      ctx.stroke();
      ctx.restore();
    }
  }

  rocketTo(x, y, strength = 1, hue) {
    if (!this.ctx) return;
    if (prefersReducedMotion) strength *= 0.72;
    this.ensureRunning();

    const hh = hue ?? pick(this.hues);
    const sx = clamp(x + rand(-40, 40), 24, this.w - 24);
    const sy = this.h + rand(20, 60);
    const ty = clamp(y, 60, this.h * 0.68);
    const dist = Math.max(120, sy - ty);

    // 初速度让“上升感”更强
    const vy = -Math.max(520, dist * rand(1.35, 1.75));
    const vx = rand(-60, 60);

    this.rockets.push({
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      vx,
      vy,
      ty,
      life: 0,
      ttl: rand(0.85, 1.25),
      strength,
      hue: hh,
    });
  }

  burst(x, y, strength = 1, hue) {
    if (!this.ctx) return;
    this.ensureRunning();
    this.explode(x, y, strength, hue ?? pick(this.hues));
  }

  explode(x, y, strength = 1, hue) {
    // 更大更亮但不密：粒子数偏少，爆点/光晕/环更大
    const s = clamp(strength, 0.35, 2.2);
    const q = this.quality;
    const base = Math.round((44 + 10 * Math.min(1.4, s)) * q);
    const glitter = Math.round((26 + 8 * Math.min(1.4, s)) * q);

    // 爆心 bloom + 冲击波
    this.blooms.push({
      x,
      y,
      hue,
      life: 0,
      ttl: rand(0.18, 0.28),
      r0: rand(14, 22) * (0.95 + s * 0.20) * q,
      r1: rand(78, 120) * (0.92 + s * 0.24) * q,
    });
    this.rings.push({
      x,
      y,
      r: rand(8, 14) * (0.95 + s * 0.20) * q,
      vr: rand(720, 1050) * (0.92 + s * 0.18) * q,
      w: rand(3.6, 5.2) * (0.9 + s * 0.15) * q,
      hue,
      life: 0,
      ttl: rand(0.55, 0.75),
    });

    // 主爆：高速火花
    for (let i = 0; i < base; i++) {
      const a = (Math.PI * 2 * i) / base + rand(-0.08, 0.08);
      const sp = rand(260, 760) * rand(0.85, 1.18) * (0.9 + s * 0.18) * q;
      this.particles.push({
        kind: "spark",
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        ttl: rand(0.75, 1.25),
        size: rand(1.55, 2.85) * (0.9 + s * 0.16) * q,
        hue: hue + rand(-10, 10),
      });
    }

    // 星尘：更慢、更“电”
    for (let i = 0; i < glitter; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(110, 420) * (0.9 + s * 0.14) * q;
      this.particles.push({
        kind: "glitter",
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        ttl: rand(0.9, 1.55),
        size: rand(1.05, 1.95) * (0.95 + s * 0.12) * q,
        hue: hue + rand(-22, 22),
      });
    }

    // 二段小爆（更像视频那种“层次”）
    if (Math.random() < 0.62) {
      const hh = hue + rand(-35, 35);
      setTimeout(() => {
        this.burst(x + rand(-70, 70), y + rand(-45, 45), 0.70 * strength, hh);
      }, rand(110, 220));
    }
  }

  swipe(x, y, intensity = 1) {
    if (!this.ctx) return;
    this.ensureRunning();
    const hue = pick(this.hues);
    const n = Math.max(6, Math.round(14 * intensity * this.quality));
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: "trail",
        x: x + rand(-8, 8),
        y: y + rand(-8, 8),
        px: x + rand(-14, 14),
        py: y + rand(-14, 14),
        vx: rand(-180, 180) * intensity,
        vy: rand(-180, 180) * intensity,
        life: 0,
        ttl: rand(0.12, 0.26),
        size: rand(0.9, 1.6),
        hue: hue + rand(-18, 18),
      });
    }
  }
}

function initFireworks() {
  if (fw) return fw;
  if (!fxCanvas) return null;
  fw = new FireworksEngine(fxCanvas);
  return fw;
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
  // 性能优先：DOM 雪花节点太多会明显卡（尤其是电脑开着高分屏/浏览器性能差时）
  if (snowTimer) {
    clearInterval(snowTimer);
    snowTimer = null;
  }
  const burst = LOW_POWER ? 10 : 16;
  const burstGap = LOW_POWER ? 260 : 180;
  const interval = LOW_POWER ? 700 : 420;
  for (let i = 0; i < burst; i++) setTimeout(spawnFlake, i * burstGap);
  snowTimer = setInterval(() => {
    if (!snowEnabled) return;
    spawnFlake();
  }, interval);
}

function setSnowEnabled(enabled) {
  snowEnabled = !!enabled;
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
  // 优先走 Canvas 赛博烟花；兜底仍保留 DOM 版本
  if (fw) {
    fw.burst(x, y, strength);
    return;
  }
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
  if (fw) {
    fw.swipe(x, y, 0.85);
    return;
  }
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
  if (!photoEl || !photoFallbackEl) return;
  const name = CONFIG.photo;
  if (!name) {
    photoEl.src = "";
    photoEl.style.display = "none";
    photoFallbackEl.classList.remove("is-hidden");
    return;
  }

  // 用“带尾斜杠”的 base URL 构造，避免有人打开 `.../christmas-surprise`（没 /）
  // 导致相对路径被解析到父目录，从而 404
  const base = new URL(window.location.href);
  base.hash = "";
  base.search = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const src = new URL(`photos/${encodeURIComponent(name)}`, base).toString();
  photoEl.style.display = "block";
  photoFallbackEl.classList.add("is-hidden");

  photoEl.onerror = () => {
    photoEl.onerror = null;
    photoEl.style.display = "none";
    photoFallbackEl.classList.remove("is-hidden");
  };

  photoEl.decoding = "async";
  photoEl.loading = "eager";
  photoEl.src = src;
}

function preloadPhoto() {
  try {
    const name = CONFIG.photo;
    if (!name) return;
    const base = new URL(window.location.href);
    base.hash = "";
    base.search = "";
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const src = new URL(`photos/${encodeURIComponent(name)}`, base).toString();
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = src;
  } catch {}
}

function startCelebration() {
  if (celebrateTimer) {
    clearInterval(celebrateTimer);
    celebrateTimer = null;
  }
  // 视频同款感觉：火箭上升 → 多层爆炸（霓虹拖尾）
  let bursts = 0;
  celebrateTimer = setInterval(() => {
    bursts += 1;
    const x = window.innerWidth * (0.18 + Math.random() * 0.64);
    const y = window.innerHeight * (0.08 + Math.random() * 0.42);
    // 更大更亮但不密：次数更少，每次更“炸”
    if (fw) fw.rocketTo(x, y, 1.65);
    else fireworksBurst(x, y, 1.35);
    spawnFlake();
    spawnFlake();
    if (bursts >= 5) {
      clearInterval(celebrateTimer);
      celebrateTimer = null;
    }
  }, 360);
}

function stopAmbientFireworks() {
  if (ambientFireworksTimer) {
    clearInterval(ambientFireworksTimer);
    ambientFireworksTimer = null;
  }
}

function startAmbientFireworks() {
  // 性能优先：树界面背景烟花是额外开销，低配设备直接关闭
  if (prefersReducedMotion || LOW_POWER) return;
  stopAmbientFireworks();
  // 树界面的“背景烟花节奏”：别太密，保持高级感
  ambientFireworksTimer = setInterval(() => {
    if (!fw) return;
    if (!elTree || elTree.classList.contains("is-hidden")) return;
    if (Math.random() < 0.18) {
      const x = window.innerWidth * (0.22 + Math.random() * 0.56);
      const y = window.innerHeight * (0.06 + Math.random() * 0.24);
      fw.rocketTo(x, y, 1.05);
    }
  }, 2200);
}

async function unlockReward() {
  document.body.classList.remove("is-tree-mode");
  hide(elTree);
  hide(elStart);
  show(elReward);
  stopAmbientFireworks();
  setSnowEnabled(true);
  stopRenderLoop();

  if (greetingTitleEl) greetingTitleEl.textContent = CONFIG.greetingTitle || "圣诞节快乐";
  if (greetingSubEl) greetingSubEl.textContent = CONFIG.greetingSub || "";
  renderPhoto();
  startCelebration();
}

// ========= 页面流程 =========
function gatePasscodeIfNeeded() {
  if (!CONFIG.enablePasscode) return true;
  const input = window.prompt("输入暗号进入（提示：今年的生日日期？）");
  return input === CONFIG.passcode;
}

function goToTree() {
  hide(elStart);
  hide(elReward);
  show(elTree);
  document.body.classList.add("is-tree-mode");
  // 树模式下已经有 3D 雪，暂停 DOM 雪（避免双倍动画/节点导致卡顿）
  setSnowEnabled(false);
  startAmbientFireworks();
  if (three.ready) startRenderLoop();
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
  star: null,
  fallingApples: [],
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
  // 可爱苹果：主果体 + 高光 + 叶子 + 小梗（数量少但更精致）
  const seg = LOW_POWER ? 12 : 16;
  const bodyGeo = new THREE.SphereGeometry(0.16, seg, seg);
  const hlGeo = new THREE.SphereGeometry(0.05, 10, 10);
  const leafGeo = new THREE.ConeGeometry(0.05, 0.12, 10);
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.10, 10);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xff4fa3,
    roughness: 0.25,
    metalness: 0.05,
    emissive: 0xff4fa3,
    emissiveIntensity: 0.25,
  });
  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.7,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x37d6a5,
    roughness: 0.55,
    metalness: 0.0,
    emissive: 0x37d6a5,
    emissiveIntensity: 0.08,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a3c,
    roughness: 0.9,
    metalness: 0.0,
  });

  for (let i = 0; i < goal; i++) {
    const apple = new THREE.Group();
    apple.userData.isApple = true;
    apple.userData.collected = false;
    apple.userData.pop = 0;

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 1.08, 1); // 轻微拉长，更像“Q版苹果”
    apple.add(body);

    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(0.06, 0.06, 0.06);
    apple.add(hl);

    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(0.0, 0.16, 0.0);
    apple.add(stem);

    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(0.05, 0.19, 0.0);
    leaf.rotation.z = Math.PI * 0.55;
    apple.add(leaf);
    
    // 增大碰撞体积：添加一个更大的不可见碰撞体
    const hitBox = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    apple.add(hitBox);
    apple.userData.hitBox = hitBox;

    // 随机放在树上：根据树轮廓估一个半径（适配新树更圆润的轮廓）
    const yMin = 0.92;
    const yMax = 2.08;
    const y = yMin + Math.random() * (yMax - yMin);
    const t = (y - yMin) / (yMax - yMin); // 0..1
    // 更“贴表面”：半径整体外移，避免苹果埋进树里
    const radius = (1.22 * (1 - t) + 0.34) * 0.98;
    const ang = Math.random() * Math.PI * 2;
    apple.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);

    // 确保苹果在树外，更容易点到
    apple.position.multiplyScalar(1.08);
    apple.rotation.set(Math.random() * 0.22 - 0.11, Math.random() * Math.PI * 2, Math.random() * 0.22 - 0.11);
    apple.scale.setScalar(1);

    three.apples.push(apple);
    three.treeGroup.add(apple);
  }
}

function buildTree() {
  const THREE = window.THREE;

  // 更可爱、低多边形、对象更少（更省性能）
  const group = new THREE.Group();
  const SEG = LOW_POWER
    ? { cone: 16, trunk: 12, bead: 9, ground: 36 }
    : { cone: 22, trunk: 16, bead: 11, ground: 52 };

  function applyYGradient(geo, topColor, bottomColor) {
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    const y0 = bbox.min.y;
    const y1 = bbox.max.y;
    const span = Math.max(0.0001, y1 - y0);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const cTop = new THREE.Color(topColor);
    const cBot = new THREE.Color(bottomColor);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y - y0) / span;
      const c = cBot.clone().lerp(cTop, t);
      cols[i * 3 + 0] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    return geo;
  }

  // 树干：更“Q”，带渐变更可爱
  const trunkGeo = applyYGradient(
    new THREE.CylinderGeometry(0.20, 0.26, 0.62, SEG.trunk),
    0x6b4423,
    0x9a6a4b
  );
  const trunk = new THREE.Mesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  trunk.position.y = 0.28;
  group.add(trunk);

  // 树叶：更圆润的 4 层“棉花糖松树”，渐变+少面数
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const layers = [
    { y: 0.78, r: 1.10, h: 1.05, top: 0x46f3c8, bot: 0x169a78 },
    { y: 1.22, r: 0.92, h: 0.90, top: 0x3aeac0, bot: 0x118d6d },
    { y: 1.60, r: 0.74, h: 0.75, top: 0x34deb6, bot: 0x0f7e63 },
    { y: 1.92, r: 0.56, h: 0.58, top: 0x2fd4ae, bot: 0x0c6f58 },
  ];
  layers.forEach((L, i) => {
    const geo = applyYGradient(new THREE.ConeGeometry(L.r, L.h, SEG.cone), L.top, L.bot);
    const m = new THREE.Mesh(geo, leafMat);
    m.position.y = L.y;
    m.rotation.y = i * 0.55;
    group.add(m);
  });

  // 创新点：发光“糖串”彩灯（InstancedMesh：一个 drawcall）
  const beadCount = LOW_POWER ? 32 : 48;
  const beadGeo = new THREE.SphereGeometry(0.055, SEG.bead, SEG.bead);
  const beadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.95,
    vertexColors: true,
  });
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, beadCount);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  for (let i = 0; i < beadCount; i++) {
    const t = i / beadCount;
    const turns = 2.6;
    const ang = t * Math.PI * 2 * turns;
    const y = 0.95 + t * 1.20;
    const taper = 1 - t;
    const radius = (0.95 * taper + 0.25) * 0.95;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    const s = 0.92 + Math.random() * 0.18;
    const mtx = new THREE.Matrix4();
    mtx.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s, s)
    );
    beads.setMatrixAt(i, mtx);
    const hue = (185 + t * 160 + Math.random() * 24) % 360;
    const c = new THREE.Color().setHSL(hue / 360, 0.95, 0.68);
    beads.setColorAt(i, c);
  }
  beads.instanceColor.needsUpdate = true;
  group.add(beads);
  group.userData.garland = beads;
  group.userData.garlandMat = beadMat;

  // 柔和光晕（一个 Sprite，几乎不增加 draw call）
  if (!LOW_POWER) {
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gctx = glowCanvas.getContext("2d");
    if (gctx) {
      const grd = gctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      grd.addColorStop(0.0, "rgba(255,134,188,0.55)");
      grd.addColorStop(0.35, "rgba(34,199,169,0.28)");
      grd.addColorStop(0.7, "rgba(255,224,102,0.18)");
      grd.addColorStop(1.0, "rgba(255,255,255,0)");
      gctx.fillStyle = grd;
      gctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(glowCanvas);
      tex.needsUpdate = true;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.position.set(0, 1.35, -0.6);
      sprite.scale.set(3.2, 3.2, 1);
      group.add(sprite);
      group.userData.glow = sprite;
    }
  }

  // 星星：更可爱（带小表情）
  const starGroup = new THREE.Group();
  const starOuter = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffe066,
      roughness: 0.25,
      metalness: 0.45,
      emissive: 0xffe066,
      emissiveIntensity: 0.85,
    })
  );
  starGroup.add(starOuter);

  const faceMat = new THREE.MeshBasicMaterial({ color: 0x1f2430 });
  const eyeGeo = new THREE.SphereGeometry(0.03, 10, 10);
  const leftEye = new THREE.Mesh(eyeGeo, faceMat);
  const rightEye = new THREE.Mesh(eyeGeo, faceMat);
  leftEye.position.set(-0.06, 0.02, 0.17);
  rightEye.position.set(0.06, 0.02, 0.17);
  starGroup.add(leftEye, rightEye);

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 8, 24, Math.PI),
    faceMat
  );
  smile.rotation.x = Math.PI / 2;
  smile.position.set(0, -0.04, 0.17);
  starGroup.add(smile);

  starGroup.position.y = 2.35;
  starGroup.userData.isStar = true;
  starGroup.userData.face = { leftEye, rightEye };
  group.add(starGroup);

  // 雪地底座（更干净）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.0, SEG.ground),
    new THREE.MeshLambertMaterial({ color: 0xf5f9fa })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  group.add(ground);

  group.position.y = -0.06;
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
    antialias: !LOW_POWER,
    alpha: true,
    powerPreference: LOW_POWER ? "low-power" : "high-performance",
  });
  // 3D 是最大性能开销：像素比上限压低，明显减卡
  const dprCap = LOW_POWER ? 1.0 : 1.25;
  renderer.setPixelRatio(Math.min(dprCap, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // 透明背景：让底下的烟花层“透”出来（更像视频那种天空烟花）
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // 背景透明（搭配 fog 仍然有“空气感”）
  scene.background = null;
  scene.fog = new THREE.Fog(0xe8f4f8, 6, 14);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 40);
  camera.position.set(0, 1.55, 4.2);
  camera.lookAt(0, 1.2, 0);

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
  const snowCount = LOW_POWER ? 90 : 180;
  const snowGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(snowCount * 3);
  const velocities = new Float32Array(snowCount);
  const driftX = new Float32Array(snowCount);
  const driftZ = new Float32Array(snowCount);
  
  for (let i = 0; i < snowCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 30;  // x
    positions[i3 + 1] = Math.random() * 20 + 5;    // y (从上方开始)
    positions[i3 + 2] = (Math.random() - 0.5) * 30; // z
    velocities[i] = 0.02 + Math.random() * 0.03;    // 下落速度（按 60fps 设计）
    driftX[i] = (Math.random() - 0.5) * 0.010;
    driftZ[i] = (Math.random() - 0.5) * 0.008;
  }
  
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const snowMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: LOW_POWER ? 0.12 : 0.15,
    transparent: true,
    opacity: LOW_POWER ? 0.7 : 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const snowParticles = new THREE.Points(snowGeometry, snowMaterial);
  snowParticles.userData.velocities = velocities;  // 保存速度数组
  snowParticles.userData.driftX = driftX;
  snowParticles.userData.driftZ = driftZ;
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

  function applyResponsiveView() {
    if (!three.ready) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const portrait = h > w * 1.05;

    // 树在手机竖屏更容易“看不全”：缩小一点 + 相机拉远一点
    const s = portrait ? (Math.min(w, h) < 420 ? 0.78 : 0.84) : 0.95;
    if (three.treeGroup) {
      three.treeGroup.scale.setScalar(s);
      three.treeGroup.position.y = -0.05 * s;
    }

    const fov = portrait ? 52 : 45;
    if (three.camera) {
      if (three.camera.fov !== fov) three.camera.fov = fov;
      three.camera.position.set(0, portrait ? 1.35 : 1.55, portrait ? 5.0 : 4.2);
      three.camera.lookAt(0, portrait ? 1.05 : 1.2, 0);
      three.camera.updateProjectionMatrix();
    }
  }

  applyResponsiveView();

  window.addEventListener("resize", () => {
    if (!three.ready) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dprCap = LOW_POWER ? 1.0 : 1.25;
    three.renderer.setPixelRatio(Math.min(dprCap, window.devicePixelRatio || 1));
    three.renderer.setSize(w, h, false);
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
    applyResponsiveView();
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

function startAppleFall(apple) {
  const THREE = window.THREE;
  if (!three.ready || !three.scene || !three.treeGroup) return;
  if (!apple || !apple.userData?.isApple) return;
  if (apple.userData.falling) return;
  apple.userData.falling = true;

  // 变成“世界坐标”的独立物体：避免跟着树一起旋转
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  apple.getWorldPosition(worldPos);
  apple.getWorldQuaternion(worldQuat);
  apple.getWorldScale(worldScale);

  try {
    apple.parent?.remove?.(apple);
  } catch {}
  three.scene.add(apple);
  apple.position.copy(worldPos);
  apple.quaternion.copy(worldQuat);
  apple.scale.copy(worldScale);

  // 为掉落动画单独克隆材质，避免影响其他苹果
  apple.traverse?.((o) => {
    if (!o || !o.isMesh) return;
    try {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 1;
      }
      o.castShadow = false;
      o.receiveShadow = false;
    } catch {}
  });

  const vel = new THREE.Vector3((Math.random() - 0.5) * 0.55, 0.25, (Math.random() - 0.5) * 0.55);
  const ang = new THREE.Vector3((Math.random() - 0.5) * 5.5, (Math.random() - 0.5) * 7.0, (Math.random() - 0.5) * 5.5);
  const groundY = (three.treeGroup.position?.y || 0) + 0.04;

  three.fallingApples.push({
    obj: apple,
    vel,
    ang,
    groundY,
    bounces: 0,
    fade: 0,
  });
}

function collectApple(apple, clientX, clientY) {
  if (!apple || !apple.userData || !apple.userData.isApple) return;
  if (apple.userData.collected) return;
  apple.userData.collected = true;
  apple.userData.pop = 1;
  three.collected += 1;
  setTreeStatus();
  popHeart(clientX, clientY);
  // 点击反馈要“亮”但别太吵
  fireworksBurst(clientX, clientY, 0.75);
  // 小创新：星星眨眼（很轻，不影响性能）
  try {
    const face = three.star?.userData?.face;
    if (face && face.rightEye && !LOW_POWER) {
      face.rightEye.scale.y = 0.15;
      setTimeout(() => {
        try { face.rightEye.scale.y = 1; } catch {}
      }, 120);
    }
  } catch {}
  safePlayAudio();

  // 苹果掉落到雪地：更有“收集感”（并且更自然，不是瞬间消失）
  try {
    // 从可点击列表移除，避免继续射线检测（也避免“点到空气”）
    const idx = three.apples ? three.apples.indexOf(apple) : -1;
    if (idx >= 0) three.apples.splice(idx, 1);
    startAppleFall(apple);
  } catch {}

  const goal = Math.max(1, CONFIG.applesToCollect || 5);
  if (three.collected >= goal) {
    // 通关：稍微停一下再跳奖励页，更有“揭晓”感
    setTimeout(() => unlockReward(), 900);
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
  const trailGap = LOW_POWER ? 140 : 70;
  const trailNeed = LOW_POWER ? 4 : 2;
  if (now - three.lastTrailAt > trailGap && Math.abs(dx) > trailNeed) {
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

  let lastRenderAt = 0;
  let snowFrame = 0;
  // 缓存星星对象，避免每帧遍历 children（省一点 CPU）
  if (!three.star) {
    three.star = three.treeGroup?.children?.find?.((o) => o.userData?.isStar) || null;
  }

  const tick = (tNow) => {
    three.animId = requestAnimationFrame(tick);
    if (!three.ready) return;

    if (typeof tNow !== "number") return;
    if (!lastRenderAt) lastRenderAt = tNow;
    const minGap = 1000 / TARGET_FPS;
    if (tNow - lastRenderAt < minGap) return;
    const dt = Math.min(0.05, (tNow - lastRenderAt) / 1000);
    lastRenderAt = tNow;

    // 自动旋转 + 惯性
    if (three.treeGroup) {
      if (!three.isDragging) {
        const auto = 0.24 * dt; // ~0.004/frame@60fps
        three.treeGroup.rotation.y += auto + three.dragVelocity * (dt * 60);
        three.dragVelocity *= Math.pow(0.94, dt * 60);
      }
    }

    // 让星星微微呼吸和旋转
    const star = three.star;
    if (star) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 2.2) * 0.06;
      star.scale.setScalar(s);
      star.rotation.y = t * 0.5;  // 缓慢旋转
    }

    // 糖串彩灯轻微呼吸（不更新每颗灯颜色，只动材质发光强度，几乎无开销）
    if (!LOW_POWER && three.treeGroup?.userData?.garlandMat) {
      const t = performance.now() * 0.001;
      const pulse = 0.78 + Math.sin(t * 1.6) * 0.18;
      three.treeGroup.userData.garlandMat.emissiveIntensity = pulse;
      if (three.treeGroup.userData.glow) {
        three.treeGroup.userData.glow.material.opacity = 0.55 + Math.sin(t * 1.2) * 0.08;
      }
    }

    // 掉落苹果动画（轻量：数量少，且只在点击后出现）
    if (three.fallingApples && three.fallingApples.length) {
      const g = 6.8; // world units/s^2
      for (let i = three.fallingApples.length - 1; i >= 0; i--) {
        const it = three.fallingApples[i];
        const o = it.obj;
        if (!o) {
          three.fallingApples.splice(i, 1);
          continue;
        }

        // 下落 + 轻微阻尼
        it.vel.y -= g * dt;
        it.vel.x *= Math.pow(0.985, dt * 60);
        it.vel.z *= Math.pow(0.985, dt * 60);
        o.position.x += it.vel.x * dt;
        o.position.y += it.vel.y * dt;
        o.position.z += it.vel.z * dt;

        o.rotation.x += it.ang.x * dt;
        o.rotation.y += it.ang.y * dt;
        o.rotation.z += it.ang.z * dt;

        // 落地
        if (o.position.y <= it.groundY) {
          o.position.y = it.groundY;
          if (it.bounces < 1 && Math.abs(it.vel.y) > 1.0) {
            it.vel.y = -it.vel.y * 0.22;
            it.vel.x *= 0.6;
            it.vel.z *= 0.6;
            it.bounces += 1;
          } else {
            it.fade += dt;
            const a = Math.max(0, 1 - it.fade * 2.0);
            o.traverse?.((m) => {
              if (m?.isMesh && m.material) m.material.opacity = a;
            });
            if (it.fade > 0.55) {
              // 落地小小亮点
              try {
                const rect = canvas.getBoundingClientRect();
                const x2 = rect.left + rect.width * 0.5;
                const y2 = rect.top + rect.height * 0.85;
                fireworksBurst(x2 + (Math.random() - 0.5) * 30, y2, 0.45);
              } catch {}
              try {
                o.traverse?.((m) => {
                  if (m?.isMesh && m.material?.dispose) m.material.dispose();
                });
              } catch {}
              try { three.scene.remove(o); } catch {}
              three.fallingApples.splice(i, 1);
            }
          }
        }
      }
    }

    // 3D 下雪动画（修复bug）
    if (three.snowParticles && three.snowGeometry) {
      snowFrame += 1;
      const stepEvery = LOW_POWER ? 3 : 2; // 降低更新频率，明显省 CPU
      if (snowFrame % stepEvery !== 0) {
        three.renderer.render(three.scene, three.camera);
        return;
      }
      const positions = three.snowGeometry.attributes.position.array;
      const velocities = three.snowParticles.userData.velocities;
      const driftX = three.snowParticles.userData.driftX;
      const driftZ = three.snowParticles.userData.driftZ;
      
      if (velocities && positions) {
        for (let i = 0; i < positions.length; i += 3) {
          const idx = i / 3;
          const vel = velocities[idx] || 0.025;
          
          // 下落
          positions[i + 1] -= vel * (dt * 60);

          // 轻微左右飘动（预生成漂移，避免每粒子每帧 sin/cos）
          positions[i] += (driftX ? driftX[idx] : 0) * (dt * 60);
          positions[i + 2] += (driftZ ? driftZ[idx] : 0) * (dt * 60);
          
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
  three.animId = requestAnimationFrame(tick);
}

function stopRenderLoop() {
  if (three.animId) cancelAnimationFrame(three.animId);
  three.animId = null;
}

// ========= 事件绑定 =========
btnStart.addEventListener("click", () => {
  if (!gatePasscodeIfNeeded()) {
    alert("暗号不对哦～再想想。");
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
  safePlayAudio();
  // “再放一次烟花”：给一段完整连发
  startCelebration();
  const r = e.currentTarget.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (fw) fw.burst(x, y, 0.9);
  else fireworksBurst(x, y, 1.0);
});

// 全屏点击：冒小心心（在 3D 树界面会更克制：避免覆盖太多）
document.addEventListener("pointerdown", (e) => {
  if (elTree && !elTree.classList.contains("is-hidden")) return;
  popHeart(e.clientX, e.clientY);
});

// 初始化
initFireworks();
setupBgmFallback();
startSnow();
setTreeStatus();
preloadPhoto();



