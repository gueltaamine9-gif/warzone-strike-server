import * as THREE from 'three';

const textureCache = new Map<string, THREE.CanvasTexture>();

function makeCanvasTexture(
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const fullKey = `${key}_${repeatX}_${repeatY}`;
  const cached = textureCache.get(fullKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;

  textureCache.set(fullKey, tex);
  return tex;
}

export function getCamoTexture(
  style: 'woodland' | 'midnight' | 'desert' | 'urban' | 'arid',
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const palettes: Record<typeof style, string[]> = {
    woodland: ['#223022', '#172017', '#32422b', '#121712'],
    midnight: ['#13161c', '#1a1e26', '#0d0f14', '#262c36'],
    desert: ['#6c5c45', '#524432', '#827156', '#3d3326'],
    urban: ['#2b313a', '#1e232a', '#3d4551', '#15181d'],
    arid: ['#4f4234', '#392f24', '#665745', '#2a221a'],
  };
  const colors = palettes[style];

  return makeCanvasTexture(
    `camo_${style}`,
    256,
    (ctx, s) => {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = colors[(i % 3) + 1];
        const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * s;
        const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * s;
        const rx = 12 + (i % 28);
        const ry = 8 + ((i * 3) % 20);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, (i * 0.7) % Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle fabric weave
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 1;
      for (let y = 0; y < s; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
    },
    2,
    2,
    maxAnisotropy,
  );
}

export function getAsphaltTexture(repeat = 24, maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'asphalt_dark_v2',
    512,
    (ctx, s) => {
      ctx.fillStyle = '#1b1e24';
      ctx.fillRect(0, 0, s, s);
      // Aggregate mineral speckle & tire wear streaks
      for (let i = 0; i < 3200; i++) {
        const x = (i * 173 + (i % 19) * 7) % s;
        const y = (i * 311 + (i % 23) * 11) % s;
        ctx.fillStyle =
          i % 4 === 0
            ? 'rgba(255,255,255,0.045)'
            : i % 4 === 1
              ? 'rgba(140,150,165,0.035)'
              : 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, y, (i % 2) + 1, (i % 2) + 1);
      }
      // Concrete road expansion joints & weathered cracks
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
      ctx.strokeStyle = 'rgba(180,155,95,0.12)';
      ctx.lineWidth = 4;
      ctx.setLineDash([28, 22]);
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(s / 2, s);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    repeat,
    repeat,
    maxAnisotropy,
  );
}

export function getConcreteBuildingTexture(repeatX = 2, repeatY = 2, maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'concrete_building_v2',
    512,
    (ctx, s) => {
      // Base weathered architectural concrete
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#2c323b');
      grad.addColorStop(0.5, '#252a32');
      grad.addColorStop(1, '#1e2229');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Subtle concrete grain & rain-weathering streaks
      for (let i = 0; i < 1400; i++) {
        const x = (i * 97) % s;
        const y = (i * 193) % s;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)';
        ctx.fillRect(x, y, 2, 3);
      }
      for (let i = 0; i < 36; i++) {
        const sx = (i * 43) % s;
        ctx.fillStyle = 'rgba(10,12,16,0.16)';
        ctx.fillRect(sx, 0, 4 + (i % 5), s);
      }

      // Precast architectural horizontal panel seams + rivets
      ctx.strokeStyle = '#14171d';
      ctx.lineWidth = 4;
      for (let y = 0; y < s; y += 128) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 3);
        ctx.lineTo(s, y + 3);
        ctx.stroke();
        ctx.strokeStyle = '#14171d';
        ctx.lineWidth = 4;
      }

      // Realistic recessed architectural windows with aluminum mullions & glass reflection
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const wx = col * 128 + 20;
          const wy = row * 128 + 26;
          const ww = 88;
          const wh = 72;

          // Concrete window reveal shadow
          ctx.fillStyle = '#101318';
          ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

          // Window glass with subtle sky reflection / interior warm cue
          const lit = (row * 3 + col * 5) % 9 === 0;
          const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
          if (lit) {
            g.addColorStop(0, '#5a4a2e');
            g.addColorStop(1, '#262015');
          } else {
            g.addColorStop(0, '#1e2b38');
            g.addColorStop(0.55, '#111820');
            g.addColorStop(1, '#0b0e14');
          }
          ctx.fillStyle = g;
          ctx.fillRect(wx, wy, ww, wh);

          // Diagonal glass sheen
          ctx.fillStyle = 'rgba(180,215,245,0.08)';
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + ww * 0.55, wy);
          ctx.lineTo(wx, wy + wh * 0.65);
          ctx.closePath();
          ctx.fill();

          // Window aluminum frame & center mullion + concrete sill
          ctx.strokeStyle = '#3b434f';
          ctx.lineWidth = 3;
          ctx.strokeRect(wx, wy, ww, wh);
          ctx.fillStyle = '#333a45';
          ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
          ctx.fillStyle = '#424a57';
          ctx.fillRect(wx - 6, wy + wh + 2, ww + 12, 7);
        }
      }
    },
    repeatX,
    repeatY,
    maxAnisotropy,
  );
}

export function getSandstoneRuinsTexture(repeatX = 2, repeatY = 2, maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'sandstone_iraq_v2',
    512,
    (ctx, s) => {
      ctx.fillStyle = '#4e3f2e';
      ctx.fillRect(0, 0, s, s);
      for (let row = 0; row < 12; row++) {
        const y = row * (s / 12);
        const h = s / 12 - 3;
        const offset = (row % 2) * 42;
        for (let col = -1; col < 7; col++) {
          const x = col * 86 + offset;
          const shade = (row * 7 + col * 3) % 4;
          ctx.fillStyle =
            shade === 0 ? '#453728' : shade === 1 ? '#5d4b37' : shade === 2 ? '#544331' : '#65523d';
          ctx.fillRect(x + 2, y + 2, 82, h);
          ctx.strokeStyle = 'rgba(20,15,10,0.45)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, 82, h);
        }
      }
      // Plaster & blast weathering patches
      for (let i = 0; i < 85; i++) {
        ctx.fillStyle = i % 3 === 0 ? 'rgba(18, 14, 10, 0.22)' : 'rgba(155, 130, 95, 0.08)';
        ctx.beginPath();
        ctx.arc((i * 89) % s, (i * 151) % s, 10 + (i % 18), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    repeatX,
    repeatY,
    maxAnisotropy,
  );
}

export function getForestGroundTexture(repeat = 28, maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'forest_ground_v3',
    512,
    (ctx, s) => {
      // Rich dark forest green moss & grass base
      ctx.fillStyle = '#0e2412';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2400; i++) {
        const mod = i % 5;
        ctx.fillStyle =
          mod === 0
            ? '#08170b'
            : mod === 1
              ? '#15341b'
              : mod === 2
                ? '#1b4021'
                : mod === 3
                  ? '#112a16'
                  : '#224725';
        const x = (i * 79 + (i % 13) * 5) % s;
        const y = (i * 149 + (i % 17) * 7) % s;
        ctx.fillRect(x, y, 3 + (i % 5), 3 + (i % 4));
      }
      // Subtle forest floor blades & pine needle shading
      ctx.strokeStyle = 'rgba(18, 52, 24, 0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 420; i++) {
        const bx = (i * 113) % s;
        const by = (i * 197) % s;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + ((i % 3) - 1) * 3, by - 5);
        ctx.stroke();
      }
    },
    repeat,
    repeat,
    maxAnisotropy,
  );
}

export function getCrateTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'tactical_crate_v2',
    256,
    (ctx, s) => {
      ctx.fillStyle = '#413827';
      ctx.fillRect(0, 0, s, s);
      // Wooden military crate planks
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      for (let y = 32; y < s; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
      // Heavy frame & diagonal brace
      ctx.strokeStyle = '#241e14';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, s - 14, s - 14);
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(s - 14, s - 14);
      ctx.moveTo(s - 14, 14);
      ctx.lineTo(14, s - 14);
      ctx.stroke();
      // Stencil ammo stripe & steel corner brackets
      ctx.fillStyle = '#c2963e';
      ctx.fillRect(s / 2 - 28, s / 2 - 8, 56, 16);
      ctx.fillStyle = '#1f2328';
      [
        [4, 4],
        [s - 22, 4],
        [4, s - 22],
        [s - 22, s - 22],
      ].forEach(([bx, by]) => ctx.fillRect(bx, by, 18, 18));
    },
    1,
    1,
    maxAnisotropy,
  );
}

export function getContainerTexture(colorHex: string, maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    `container_${colorHex}`,
    256,
    (ctx, s) => {
      ctx.fillStyle = colorHex;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, 0, 6, s);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 6, 0, 3, s);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, s, s);
    },
    2,
    1,
    maxAnisotropy,
  );
}

export function getCarpetTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'flying_carpet_persian_v1',
    512,
    (ctx, s) => {
      // Rich royal crimson base
      ctx.fillStyle = '#6e1418';
      ctx.fillRect(0, 0, s, s);

      // Outer deep navy & gold ornamental border
      ctx.strokeStyle = '#d4a338';
      ctx.lineWidth = 16;
      ctx.strokeRect(18, 18, s - 36, s - 36);

      ctx.strokeStyle = '#13243a';
      ctx.lineWidth = 22;
      ctx.strokeRect(42, 42, s - 84, s - 84);

      ctx.strokeStyle = '#e5ba53';
      ctx.lineWidth = 5;
      ctx.strokeRect(58, 58, s - 116, s - 116);

      // Ornate border motifs
      for (let i = 64; i <= s - 64; i += 32) {
        ctx.fillStyle = '#f3d078';
        ctx.beginPath();
        ctx.arc(i, 42, 5, 0, Math.PI * 2);
        ctx.arc(i, s - 42, 5, 0, Math.PI * 2);
        ctx.arc(42, i, 5, 0, Math.PI * 2);
        ctx.arc(s - 42, i, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Inner medallion & arabesque diamonds
      ctx.fillStyle = '#182b45';
      ctx.beginPath();
      ctx.moveTo(s / 2, 86);
      ctx.lineTo(s - 96, s / 2);
      ctx.lineTo(s / 2, s - 86);
      ctx.lineTo(96, s / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e5ba53';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Center sun star motif
      ctx.fillStyle = '#9b1c22';
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 68, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f5d47a';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#f5d47a';
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(s / 2 + Math.cos(ang) * 42, s / 2 + Math.sin(ang) * 42, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Woven fabric micro-grain
      for (let y = 0; y < s; y += 4) {
        ctx.fillStyle = y % 8 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
        ctx.fillRect(0, y, s, 2);
      }
    },
    1,
    1,
    maxAnisotropy,
  );
}

export function getSkinDetailTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  return makeCanvasTexture(
    'human_skin_pores_v1',
    256,
    (ctx, s) => {
      ctx.fillStyle = '#e5d5c8';
      ctx.fillRect(0, 0, s, s);
      // Natural warm pore & subsurface micro-variation
      for (let i = 0; i < 1600; i++) {
        const x = (i * 137) % s;
        const y = (i * 211) % s;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(140,85,60,0.06)' : 'rgba(255,240,230,0.05)';
        ctx.fillRect(x, y, 2, 2);
      }
      // Subtle cheek blush warmth & jawline shadow gradient
      const jawGrad = ctx.createLinearGradient(0, 0, 0, s);
      jawGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
      jawGrad.addColorStop(0.65, 'rgba(180,120,95,0.03)');
      jawGrad.addColorStop(1, 'rgba(70,45,35,0.16)');
      ctx.fillStyle = jawGrad;
      ctx.fillRect(0, 0, s, s);
    },
    1,
    1,
    maxAnisotropy,
  );
}

