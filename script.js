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
window.__CHRISTMAS_SURPRISE_BUILD__ = "2025-12-30d";
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
  const name = CONFIG.photo;
  if (!name) {
    photoEl.src = "";
    photoEl.style.display = "none";
    photoFallbackEl.classList.remove("is-hidden");
    return;
  }

  const src = `./photos/${name}`;
  photoEl.style.display = "block";
  photoFallbackEl.classList.add("is-hidden");
  photoEl.src = src;

  photoEl.onerror = () => {
    photoEl.onerror = null;
    photoEl.style.display = "none";
    photoFallbackEl.classList.remove("is-hidden");
  };
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
  // 增大苹果尺寸，更容易点到
  const appleSeg = LOW_POWER ? 16 : 24;
  const geo = new THREE.SphereGeometry(0.18, appleSeg, appleSeg);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff3b6f,
    roughness: 0.2,
    metalness: 0.15,
    emissive: 0xff3b6f,
    emissiveIntensity: 0.4,  // 更亮，更容易看到
  });

  for (let i = 0; i < goal; i++) {
    const apple = new THREE.Mesh(geo, mat.clone());
    apple.userData.isApple = true;
    apple.userData.collected = false;
    apple.userData.pop = 0;
    
    // 增大碰撞体积：添加一个更大的不可见碰撞体
    const hitBox = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    apple.add(hitBox);
    apple.userData.hitBox = hitBox;

    // 随机放在树上：越往上半径越小，但确保在可见位置
    const y = 0.7 + Math.random() * 1.6;
    const t = (y - 0.7) / 1.6; // 0..1
    const radius = 1.15 * (1 - t) * 0.98;  // 稍微外移
    const ang = Math.random() * Math.PI * 2;
    apple.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);

    // 确保苹果在树外，更容易点到
    apple.position.multiplyScalar(1.08);
    apple.rotation.set(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5);
    apple.scale.setScalar(1);

    three.apples.push(apple);
    three.treeGroup.add(apple);
  }
}

function buildTree() {
  const THREE = window.THREE;

  const group = new THREE.Group();
  const SEG = LOW_POWER
    ? { cone: 24, branchCone: 16, bulb: 14, ornament: 16, trunk: 16, ground: 48 }
    : { cone: 36, branchCone: 24, bulb: 20, ornament: 24, trunk: 24, ground: 64 };

  // 树干（更精致，有纹理感）
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.65, SEG.trunk),
    new THREE.MeshStandardMaterial({ 
      color: 0x6b4423, 
      roughness: 0.85,
      metalness: 0.1
    })
  );
  trunk.position.y = 0.32;
  trunk.castShadow = true;
  group.add(trunk);

  // 树叶层（5层，更精致有层次，使用更自然的绿色渐变）
  const layers = [
    { y: 0.85, r: 1.35, h: 1.3, c: 0x2ecf9f },  // 底层最大
    { y: 1.35, r: 1.15, h: 1.1, c: 0x26c08f },
    { y: 1.75, r: 0.95, h: 0.95, c: 0x1eb17f },
    { y: 2.1, r: 0.75, h: 0.8, c: 0x16a26f },
    { y: 2.4, r: 0.55, h: 0.65, c: 0x0e935f },  // 顶层最小
  ];
  
  layers.forEach((layer, idx) => {
    // 每层用多个小锥体组合，更有层次感
    const layerGroup = new THREE.Group();
    
    // 主锥体
    const main = new THREE.Mesh(
      new THREE.ConeGeometry(layer.r, layer.h, SEG.cone),
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
          new THREE.ConeGeometry(layer.r * 0.3, layer.h * 0.4, SEG.branchCone),
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

  // 星星（更精致，多层设计）
  const starGroup = new THREE.Group();
  
  // 外层大星星
  const starOuter = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
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
    new THREE.OctahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.9,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
    })
  );
  starGroup.add(starInner);
  
  starGroup.position.y = 2.75;
  starGroup.userData.isStar = true;
  group.add(starGroup);

  // 彩灯串（更精致，有闪烁感）
  const bulbGeo = new THREE.SphereGeometry(0.07, SEG.bulb, SEG.bulb);
  const bulbColors = [
    0xff86bc, 0x22c7a9, 0xffd166, 0x6a7dff, 
    0xff5fa2, 0xffffff, 0xffb3d9, 0x4dd0e1
  ];
  
  // 彩灯：性能优先，减少 draw calls（数量太多会让部分电脑/手机卡）
  const bulbLayers = LOW_POWER ? 4 : 5;
  for (let layer = 0; layer < bulbLayers; layer++) {
    const layerY = 0.9 + layer * 0.4;
    const layerRadius = 1.2 * (1 - layer * 0.15);
    const bulbsPerLayer = (LOW_POWER ? 5 : 6) + layer * 1;
    
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

  // 装饰球（更精致，有高光）
  const ornamentGeo = new THREE.SphereGeometry(0.1, SEG.ornament, SEG.ornament);
  const ornamentColors = [
    { c: 0xff3b6f, m: 0.7 },  // 红色
    { c: 0xffd166, m: 0.8 },  // 金色
    { c: 0x6a7dff, m: 0.6 },  // 蓝色
    { c: 0x22c7a9, m: 0.65 }, // 青色
  ];
  
  const ornamentCount = LOW_POWER ? 7 : 12;
  for (let i = 0; i < ornamentCount; i++) {
    const y = 1.0 + Math.random() * 1.5;
    const t = (y - 1.0) / 1.5;
    const radius = 1.1 * (1 - t) * 0.97;
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

  // 底座（雪地，更精致）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, SEG.ground),
    new THREE.MeshStandardMaterial({ 
      color: 0xf5f9fa,
      roughness: 0.95,
      metalness: 0.0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  group.add(ground);

  group.position.y = -0.05;
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

function collectApple(apple, clientX, clientY) {
  if (!apple || !apple.userData || !apple.userData.isApple) return;
  if (apple.userData.collected) return;
  apple.userData.collected = true;
  apple.userData.pop = 1;
  apple.visible = false;
  three.collected += 1;
  setTreeStatus();
  popHeart(clientX, clientY);
  // 点击反馈要“亮”但别太吵
  fireworksBurst(clientX, clientY, 0.75);
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
startSnow();
setTreeStatus();



