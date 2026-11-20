import type { WeaponId } from '../game/types';

export function PubgBulletIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <g transform="rotate(-38 16 16)">
        <path
          d="M12.5 9.5C12.5 6.2 14.3 3.2 16 2C17.7 3.2 19.5 6.2 19.5 9.5V12.5H12.5V9.5Z"
          fill="currentColor"
        />
        <rect x="12" y="13.5" width="8" height="12.5" rx="1" fill="currentColor" fillOpacity="0.9" />
        <rect x="11.5" y="26.8" width="9" height="2.4" rx="0.8" fill="currentColor" />
      </g>
      <path
        d="M23.5 5.5L26.5 3.5M25.5 9.5L29 9M21 4L22.5 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function PubgFistIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M8.5 11.5C8.5 9.8 9.8 8.5 11.4 8.5C12.1 8.5 12.7 8.8 13.1 9.2C13.5 8.1 14.6 7.5 15.8 7.5C16.7 7.5 17.5 7.9 18 8.6C18.5 8 19.3 7.7 20.1 7.7C21.6 7.7 22.8 8.9 22.8 10.4V11.3C24 11.5 25 12.5 25 13.8V17.4C25 20.8 22.7 23.4 20.2 24.4V27.5H11.8V24.2C9.5 22.8 7.5 20.2 7.5 16.8V13.8C7.5 12.6 7.9 11.9 8.5 11.5Z"
        fill="currentColor"
      />
      <path
        d="M12.5 9.5V14.2M16 8.8V14.2M19.5 9.2V14.2M11 16.5H18.5"
        stroke="#171717"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}

export function PubgCrouchIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="17.5" cy="7.5" r="3" fill="currentColor" />
      <path
        d="M15.2 11.5C13.2 11.5 11.8 12.8 11.2 15.2L9.8 19.2L6.8 22.8C6.1 23.6 6.4 24.8 7.3 25.3C8.2 25.8 9.3 25.4 9.9 24.6L13.2 20.6L15.8 20.8L15.5 25.4C15.4 26.4 16.2 27.2 17.2 27.2C18.2 27.2 19 26.5 19.1 25.5L19.6 19.6C19.7 18.4 18.9 17.3 17.7 17L16.2 16.6L17.4 14.3L22.5 15.8C23.4 16.1 24.4 15.6 24.7 14.6C25 13.7 24.5 12.7 23.5 12.4L16.5 11.5H15.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PubgProneIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="24" cy="15.5" r="2.6" fill="currentColor" />
      <path
        d="M3.5 22.2C2.6 22.2 2 21.5 2 20.7C2 19.8 2.7 19.2 3.5 19.2L10.8 19L16.5 17.2C18.2 16.7 20.1 17 21.6 18L24.5 20H28.5C29.3 20 30 20.7 30 21.5C30 22.3 29.3 23 28.5 23H22.2L18.8 21.6L11.5 22.5L3.5 22.2Z"
        fill="currentColor"
      />
      <rect x="23" y="18.2" width="7.5" height="1.6" rx="0.7" fill="currentColor" />
    </svg>
  );
}

export function PubgJumpIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <circle cx="16.5" cy="5.8" r="2.9" fill="currentColor" />
      <path
        d="M14.8 9.6L11.2 13.6L7.5 12.2C6.6 11.9 5.6 12.4 5.3 13.3C5 14.2 5.5 15.2 6.4 15.5L11.2 17.3C11.9 17.5 12.6 17.3 13.1 16.8L14.5 15.2L13.5 20L8.8 24.4C8.1 25.1 8.1 26.2 8.8 26.9C9.5 27.6 10.6 27.6 11.3 26.9L16.2 22.3L19.8 26.4C20.5 27.2 21.6 27.2 22.4 26.6C23.1 25.9 23.2 24.8 22.5 24L18.4 19.3L19.2 13.8L23.2 11.2C24 10.7 24.2 9.6 23.7 8.8C23.2 8 22.1 7.8 21.3 8.3L17.2 10.7L14.8 9.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PubgPeekIcon({ dir, className = 'w-6 h-6' }: { dir: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      className={className}
      style={dir === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M8.5 4.5L3 12L8.5 19.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="7.2" r="2.6" fill="currentColor" />
      <path
        d="M12.5 11.4C14.2 10.4 17.6 10.6 19.5 12.2L22.5 20.5H15.2L12.5 11.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PubgScopeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <circle cx="14" cy="14" r="8.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="14" cy="14" r="2" fill="currentColor" />
      <path
        d="M14 2V7.5M14 20.5V26M2 14H7.5M20.5 14H26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PubgReloadIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <path
        d="M12.5 7.5H17.5L16.3 15.2C16 17 16.5 19 17.8 20.6L13.5 21.8C12 19.6 11.5 17 11.9 14.3L12.5 7.5Z"
        fill="currentColor"
      />
      <path
        d="M22.5 13.5C22.5 8.8 18.7 5 14 5C11.4 5 9.1 6.2 7.5 8M5.5 14.5C5.5 19.2 9.3 23 14 23C16.6 23 18.9 21.8 20.5 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M6.2 5.2L7.3 8.6L10.7 7.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PubgGrenadeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <rect x="11.5" y="4" width="5" height="3.2" rx="0.8" fill="currentColor" />
      <path d="M16.5 5.5H19.5C20.5 5.5 21.2 6.4 21 7.4L19.8 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9.2" cy="5.8" r="2.1" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="14" cy="16" rx="6.2" ry="7.6" fill="currentColor" />
      <path d="M8.5 14H19.5M8.8 18H19.2M14 9V23" stroke="#171717" strokeWidth="1.3" opacity="0.55" />
    </svg>
  );
}

export function PubgSmokeGrenadeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <rect x="10" y="7" width="8" height="16.5" rx="2" fill="currentColor" />
      <rect x="10" y="11" width="8" height="3.2" fill="#38bdf8" />
      <rect x="11.5" y="4.2" width="5" height="2.8" rx="0.6" fill="currentColor" />
      <circle cx="8.2" cy="5.8" r="1.9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M17.5 4.8C20.2 3 23 4.5 23 7C23 8.8 21.3 9.8 20 9.5" stroke="#cbd5e1" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function PubgMolotovIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <path
        d="M12.2 8.2H15.8L16.3 12L18.8 15C19.2 15.6 19.4 16.3 19.4 17V22.8C19.4 24 18.4 25 17.2 25H10.8C9.6 25 8.6 24 8.6 22.8V17C8.6 16.3 8.8 15.6 9.2 15L11.7 12L12.2 8.2Z"
        fill="currentColor"
      />
      <rect x="9.6" y="17.5" width="8.8" height="6" rx="1" fill="#f97316" />
      <path
        d="M14 2.2C15.8 4.2 16.6 5.6 15.7 7.2C15.2 8 13.8 8.3 13.1 7.6C12.2 6.8 12.6 4.8 14 2.2Z"
        fill="#facc15"
      />
    </svg>
  );
}

export function WeaponMiniSilhouette({ weaponId, className = 'w-11 h-4' }: { weaponId: WeaponId; className?: string }) {
  const isSniper =
    weaponId === 'amr' ||
    weaponId === 'barrett' ||
    weaponId === 'cheytac' ||
    weaponId === 'awm' ||
    weaponId === 'm24' ||
    weaponId === 'kar98' ||
    weaponId === 'mk14' ||
    weaponId === 'svd';
  const isShotgun = weaponId === 's12k';
  const isSmg = weaponId === 'ump45' || weaponId === 'vector';
  const isPistol = weaponId === 'deagle' || weaponId === 'p18c';
  const isLmg = weaponId === 'm249';
  if (isPistol) {
    return (
      <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
        <path d="M16 4.5H39V7.5H27L25.5 14H20L21.5 7.5H16V4.5Z" />
      </svg>
    );
  }
  if (isSniper) {
    return (
      <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
        <path d="M2 8L10 7H17V5H28V7H53V8.6H31V11.5H27L26 9.5H19L16 14H12L14 9.5H6L2 12.5V8Z" />
        <rect x="18" y="2.2" width="11" height="2.2" rx="0.8" />
      </svg>
    );
  }
  if (isLmg) {
    return (
      <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
        <path d="M2 7.5L10 6.5H35V7.3H51V8.8H35V10.5H31V14.5H23.5V10.5H19L16 14H12.5L15 9.8H6L2 12.5V7.5Z" />
        <rect x="19" y="3.5" width="7" height="2" rx="0.6" />
      </svg>
    );
  }
  if (isShotgun) {
    return (
      <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
        <path d="M3 8L11 7H48V9H34V11.5H25V14.5H21V11H16L13 14H9L12 9.8H4L3 8Z" />
      </svg>
    );
  }
  if (isSmg) {
    return (
      <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
        <path d="M8 7H39V9.2H31V15H27.5V10.5H22L19 14H16L18 10.2H8V7Z" />
        <rect x="18" y="4.5" width="7" height="2" rx="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 56 16" fill="currentColor" className={className}>
      <path d="M3 7.5L11 6.5H18V5.2H31V6.8H50V8.4H33V10.5H30L31.5 14.8H27.5L26 10.5H20L17 14H13.5L16 9.8H6L3 12.5V7.5Z" />
      <rect x="20" y="3.2" width="6.5" height="1.8" rx="0.6" />
    </svg>
  );
}
