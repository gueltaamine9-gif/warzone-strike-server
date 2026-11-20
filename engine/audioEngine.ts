import type { WeaponId } from '../game/types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 1.2;
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playGunshot(weaponId: WeaponId, distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const atten = Math.max(0.05, 1 / (1 + distance * 0.044));
    const now = ctx.currentTime;

    // Weapon ballistic profile (PUBG-authentic transients, crack, punch & valley tail)
    let duration = 0.24;
    let crackFreq = 3200;
    let blastFreq = 1050;
    let subStart = 128;
    let tailDuration = 0.3;
    let vol = 0.44 * atten;
    let hasEcho = true;

    if (weaponId === 'amr' || weaponId === 'barrett') {
      duration = 0.62;
      crackFreq = 4700;
      blastFreq = 1480;
      subStart = 68;
      tailDuration = 0.78;
      vol = 0.74 * atten;
    } else if (weaponId === 'awm' || weaponId === 'cheytac' || weaponId === 'kar98' || weaponId === 'm24') {
      duration = weaponId === 'm24' ? 0.36 : 0.52;
      crackFreq = weaponId === 'm24' ? 2350 : 4400;
      blastFreq = weaponId === 'm24' ? 720 : 1320;
      subStart = 84;
      tailDuration = weaponId === 'm24' ? 0.42 : 0.65;
      vol = (weaponId === 'm24' ? 0.48 : 0.68) * atten;
    } else if (weaponId === 'mk14' || weaponId === 'svd') {
      duration = 0.31;
      crackFreq = 3700;
      blastFreq = 1120;
      subStart = 104;
      tailDuration = 0.38;
      vol = 0.52 * atten;
    } else if (weaponId === 'deagle') {
      duration = 0.29;
      crackFreq = 3400;
      blastFreq = 1080;
      subStart = 102;
      tailDuration = 0.34;
      vol = 0.54 * atten;
    } else if (weaponId === 's12k') {
      duration = 0.34;
      crackFreq = 2150;
      blastFreq = 820;
      subStart = 90;
      tailDuration = 0.4;
      vol = 0.6 * atten;
    } else if (weaponId === 'groza') {
      duration = 0.18;
      crackFreq = 2100;
      blastFreq = 760;
      subStart = 120;
      tailDuration = 0.2;
      vol = 0.34 * atten;
      hasEcho = false;
    } else if (weaponId === 'm249') {
      duration = 0.25;
      crackFreq = 3350;
      blastFreq = 1080;
      subStart = 118;
      tailDuration = 0.3;
      vol = 0.46 * atten;
    } else if (weaponId === 'akm') {
      duration = 0.27;
      crackFreq = 2950;
      blastFreq = 920;
      subStart = 110;
      tailDuration = 0.32;
      vol = 0.48 * atten;
    } else if (weaponId === 'ump45' || weaponId === 'vector' || weaponId === 'p18c') {
      duration = 0.14;
      crackFreq = weaponId === 'p18c' ? 2900 : 2550;
      blastFreq = 1220;
      subStart = 160;
      tailDuration = 0.16;
      vol = 0.32 * atten;
      hasEcho = false;
    }

    // 0. Crisp mechanical bolt / firing-pin transient
    const bolt = ctx.createOscillator();
    const boltGain = ctx.createGain();
    bolt.type = 'triangle';
    bolt.frequency.setValueAtTime(2400, now);
    bolt.frequency.exponentialRampToValueAtTime(420, now + 0.016);
    boltGain.gain.setValueAtTime(vol * 0.32, now);
    boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    bolt.connect(boltGain);
    boltGain.connect(ctx.destination);
    bolt.start(now);
    bolt.stop(now + 0.02);

    // 1. Supersonic transient "CRACK"
    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(crackFreq, now);
    crackFilter.Q.value = 1.05;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(vol * 1.25, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(ctx.destination);
    crack.start(now, Math.random() * 0.4);
    crack.stop(now + 0.042);

    // 2. Chamber muzzle blast + outdoor echo tail
    const blast = ctx.createBufferSource();
    blast.buffer = this.noiseBuffer;
    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(blastFreq, now);
    blastFilter.frequency.exponentialRampToValueAtTime(140, now + duration);
    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(vol * 0.95, now);
    blastGain.gain.exponentialRampToValueAtTime(0.05 * vol, now + 0.07);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + tailDuration);
    blast.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(ctx.destination);
    blast.start(now, Math.random() * 0.35);
    blast.stop(now + tailDuration + 0.02);

    // 2b. Subtle urban/valley echo slapback for heavy firearms
    if (hasEcho && atten > 0.14) {
      const echo = ctx.createBufferSource();
      echo.buffer = this.noiseBuffer;
      const echoFilter = ctx.createBiquadFilter();
      echoFilter.type = 'bandpass';
      echoFilter.frequency.setValueAtTime(580, now + 0.08);
      echoFilter.Q.value = 0.7;
      const echoGain = ctx.createGain();
      echoGain.gain.setValueAtTime(0.001, now);
      echoGain.gain.setValueAtTime(vol * 0.24, now + 0.08);
      echoGain.gain.exponentialRampToValueAtTime(0.001, now + tailDuration + 0.12);
      echo.connect(echoFilter);
      echoFilter.connect(echoGain);
      echoGain.connect(ctx.destination);
      echo.start(now + 0.08, Math.random() * 0.3);
      echo.stop(now + tailDuration + 0.14);
    }

    // 3. Chest pressure punch (brief sub-kick)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(subStart, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.06);
    subGain.gain.setValueAtTime(vol * 0.78, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.07);
  }

  public playPunch(hit: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Air whoosh
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.noiseBuffer;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.setValueAtTime(380, now);
    wf.frequency.exponentialRampToValueAtTime(920, now + 0.09);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.18, now);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    whoosh.connect(wf);
    wf.connect(wg);
    wg.connect(ctx.destination);
    whoosh.start(now);
    whoosh.stop(now + 0.12);

    if (hit) {
      // Heavy melee impact thud
      const thud = ctx.createOscillator();
      const tg = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(145, now + 0.02);
      thud.frequency.exponentialRampToValueAtTime(42, now + 0.12);
      tg.gain.setValueAtTime(0.45, now + 0.02);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      thud.connect(tg);
      tg.connect(ctx.destination);
      thud.start(now + 0.02);
      thud.stop(now + 0.14);
    }
  }

  public playExplosion(distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const atten = Math.max(0.1, 1 / (1 + distance * 0.03));
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.95);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.72 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.98);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 1.0);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    subGain.gain.setValueAtTime(0.65 * atten, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.6);
  }

  public playGrenadePin(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1150, now);
    osc.frequency.exponentialRampToValueAtTime(1750, now + 0.06);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playHitMarker(headshot: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (headshot) {
      // Iconic PUBG Level-3 Helmet metallic ping + crisp skull/ceramic crack!
      [1680, 2890, 4150].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 2 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.76, now + 0.11);
        gain.gain.setValueAtTime(idx === 0 ? 0.36 : idx === 1 ? 0.25 : 0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.125);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      });
      if (this.noiseBuffer) {
        const crunch = ctx.createBufferSource();
        crunch.buffer = this.noiseBuffer;
        const cf = ctx.createBiquadFilter();
        cf.type = 'highpass';
        cf.frequency.value = 3200;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.32, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        crunch.connect(cf);
        cf.connect(cg);
        cg.connect(ctx.destination);
        crunch.start(now);
        crunch.stop(now + 0.06);
      }
      return;
    }

    // Crisp muted body impact tick
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.055);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playKillChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 320 : 490, now + offset);
      gain.gain.setValueAtTime(0.08, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  public playFootstep(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.07);
  }

  public playElevatorHum(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(145, now + 0.3);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playUiClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playJumpPadLaunch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.28);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    if (this.noiseBuffer) {
      const air = ctx.createBufferSource();
      air.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.35);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.22, now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      air.connect(filter);
      filter.connect(ag);
      ag.connect(ctx.destination);
      air.start(now);
      air.stop(now + 0.4);
    }
  }

  public playCarpetLaunch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [330, 495, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.05;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.25);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playParachuteOpen(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.36);
  }

  public playSmokeHiss(distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const atten = Math.max(0.08, 1 / (1 + distance * 0.035));
    const now = ctx.currentTime;

    // Sharp canister pop + pressurized smoke hiss
    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = 'triangle';
    pop.frequency.setValueAtTime(520, now);
    pop.frequency.exponentialRampToValueAtTime(140, now + 0.09);
    popGain.gain.setValueAtTime(0.28 * atten, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    pop.connect(popGain);
    popGain.connect(ctx.destination);
    pop.start(now);
    pop.stop(now + 0.11);

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer;
    hiss.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32 * atten, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
    hiss.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    hiss.start(now);
    hiss.stop(now + 2.15);
  }

  public playMolotovShatterFire(distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const atten = Math.max(0.08, 1 / (1 + distance * 0.032));
    const now = ctx.currentTime;

    // Glass bottle shatter transients
    [2900, 4100, 5600].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.018;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.06);
      g.gain.setValueAtTime(0.24 * atten, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    });

    // Roaring fire whoosh + crackle
    const fire = ctx.createBufferSource();
    fire.buffer = this.noiseBuffer;
    fire.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.linearRampToValueAtTime(620, now + 1.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.42 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.08 * atten, now + 0.65);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
    fire.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    fire.start(now);
    fire.stop(now + 2.45);
  }

  private lastEnginePulse = 0;
  public playVehicleEngine(isBike: boolean, speedRatio: number): void {
    const nowMs = performance.now();
    if (nowMs - this.lastEnginePulse < 95) return;
    this.lastEnginePulse = nowMs;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = isBike ? 'sawtooth' : 'triangle';
    const baseFreq = isBike ? 72 + speedRatio * 95 : 46 + speedRatio * 55;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.04, now + 0.09);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBike ? 460 : 280, now);

    gain.gain.setValueAtTime(0.045 + speedRatio * 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playVehicleRamImpact(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const thud = ctx.createOscillator();
    const tg = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(160, now);
    thud.frequency.exponentialRampToValueAtTime(34, now + 0.19);
    tg.gain.setValueAtTime(0.55, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    thud.connect(tg);
    tg.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.22);

    if (this.noiseBuffer) {
      const crunch = ctx.createBufferSource();
      crunch.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.14);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.32, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      crunch.connect(filter);
      filter.connect(cg);
      cg.connect(ctx.destination);
      crunch.start(now);
      crunch.stop(now + 0.17);
    }
  }
}

export const soundEngine = new SoundEngine();
