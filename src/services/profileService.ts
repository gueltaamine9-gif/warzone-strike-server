import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { MapId, PlayerLoadout } from '../game/types';

export interface CloudProfile {
  uid: string;
  callsign: string;
  outfitId: string;
  helmetId: string;
  primaryWeapon: string;
  secondaryWeapon: string;
  totalKills: number;
  totalDeaths: number;
  matchesPlayed: number;
}

export interface FriendRecord {
  friendUid: string;
  callsign: string;
}

export interface RoomInviteRecord {
  id: string;
  fromUid: string;
  fromCallsign: string;
  toUid: string;
  roomCode: string;
  mapId: MapId;
  status: 'pending' | 'accepted' | 'declined';
}

export function sanitizeEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 128);
}

export function formatFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  const host = typeof window !== 'undefined' ? window.location.hostname || window.location.origin : '';

  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    return `النطاق الحالي (${host || 'localhost'}) غير مضاف في Firebase Authorized Domains. أضف النطاق في إعدادات Firebase Authentication أو افتح اللعبة عبر رابط السيرفر المعتمد.`;
  }
  if (code === 'auth/popup-blocked') {
    return 'المتصفح منع نافذة تسجيل الدخول المنبثقة. تم التحويل لتسجيل الدخول المباشر، يرجى السماح أو فتح الرابط عبر Chrome.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخوادم Firebase Auth. تأكد من اتصال الإنترنت.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'تم إلغاء نافذة تسجيل الدخول قبل إتمام العملية.';
  }
  return `خطأ في تسجيل دخول Google (${code || 'Auth Error'}): ${msg || 'تأكد من إعداد النطاق في Firebase Authorized Domains.'}`;
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  const res = await getRedirectResult(auth);
  return res?.user ?? null;
}

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfile(
  user: User,
  fallbackLoadout: PlayerLoadout,
): Promise<CloudProfile> {
  const userRef = doc(db, 'users', user.uid);
  let existing: CloudProfile | null = null;

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      existing = {
        uid: user.uid,
        callsign: String(data.callsign || fallbackLoadout.callsign),
        outfitId: String(data.outfitId || fallbackLoadout.outfitId),
        helmetId: String(data.helmetId || fallbackLoadout.helmetId),
        primaryWeapon: String(data.primaryWeapon || fallbackLoadout.primaryWeapon),
        secondaryWeapon: String(data.secondaryWeapon || fallbackLoadout.secondaryWeapon),
        totalKills: Number(data.totalKills || 0),
        totalDeaths: Number(data.totalDeaths || 0),
        matchesPlayed: Number(data.matchesPlayed || 0),
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  const safeCallsign = (
    existing?.callsign ||
    fallbackLoadout.callsign ||
    user.displayName ||
    'مقاتل_النخبة'
  )
    .trim()
    .slice(0, 24);

  const validCallsign = safeCallsign.length >= 2 ? safeCallsign : 'مقاتل_1';

  const profilePayload = {
    uid: user.uid,
    callsign: validCallsign,
    outfitId: existing?.outfitId || fallbackLoadout.outfitId,
    helmetId: existing?.helmetId || fallbackLoadout.helmetId,
    primaryWeapon: existing?.primaryWeapon || fallbackLoadout.primaryWeapon,
    secondaryWeapon: existing?.secondaryWeapon || fallbackLoadout.secondaryWeapon,
    totalKills: Math.floor(Math.max(0, existing?.totalKills ?? 0)),
    totalDeaths: Math.floor(Math.max(0, existing?.totalDeaths ?? 0)),
    matchesPlayed: Math.floor(Math.max(0, existing?.matchesPlayed ?? 0)),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, profilePayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }

  if (user.email) {
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');
    try {
      await setDoc(
        privateRef,
        {
          uid: user.uid,
          email: user.email.slice(0, 160),
          displayName: (user.displayName || validCallsign).slice(0, 80),
          photoURL: (user.photoURL || '').slice(0, 512),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/private/info`);
    }

    const emailKey = sanitizeEmailKey(user.email);
    const dirRef = doc(db, 'directory', emailKey);
    try {
      await setDoc(
        dirRef,
        {
          uid: user.uid,
          callsign: validCallsign,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `directory/${emailKey}`);
    }
  }

  return {
    uid: user.uid,
    callsign: validCallsign,
    outfitId: profilePayload.outfitId,
    helmetId: profilePayload.helmetId,
    primaryWeapon: profilePayload.primaryWeapon,
    secondaryWeapon: profilePayload.secondaryWeapon,
    totalKills: profilePayload.totalKills,
    totalDeaths: profilePayload.totalDeaths,
    matchesPlayed: profilePayload.matchesPlayed,
  };
}

export async function saveLoadoutToCloud(
  user: User,
  loadout: PlayerLoadout,
): Promise<void> {
  const safeCallsign = loadout.callsign.trim().slice(0, 24);
  if (safeCallsign.length < 2) return;

  const userRef = doc(db, 'users', user.uid);
  try {
    await updateDoc(userRef, {
      callsign: safeCallsign,
      outfitId: loadout.outfitId,
      helmetId: loadout.helmetId,
      primaryWeapon: loadout.primaryWeapon,
      secondaryWeapon: loadout.secondaryWeapon,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
  }

  if (user.email) {
    const emailKey = sanitizeEmailKey(user.email);
    try {
      await updateDoc(doc(db, 'directory', emailKey), {
        callsign: safeCallsign,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `directory/${emailKey}`);
    }
  }
}

export async function recordMatchStatsToCloud(
  user: User,
  killsDelta: number,
  deathsDelta: number,
): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const d = snap.data();
    await updateDoc(userRef, {
      totalKills: Math.floor(Math.max(0, Number(d.totalKills || 0) + Math.max(0, killsDelta))),
      totalDeaths: Math.floor(Math.max(0, Number(d.totalDeaths || 0) + Math.max(0, deathsDelta))),
      matchesPlayed: Math.floor(Math.max(0, Number(d.matchesPlayed || 0) + 1)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
  }
}

export async function addFriendByEmail(
  user: User,
  friendEmail: string,
): Promise<{ ok: true; friend: FriendRecord } | { ok: false; message: string }> {
  const cleanEmail = friendEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, message: 'يرجى إدخال بريد جوجل صحيح' };
  }
  if (user.email && cleanEmail === user.email.toLowerCase()) {
    return { ok: false, message: 'لا يمكنك إضافة بريدك الخاص' };
  }

  const emailKey = sanitizeEmailKey(cleanEmail);
  let targetSnap;
  try {
    targetSnap = await getDoc(doc(db, 'directory', emailKey));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `directory/${emailKey}`);
  }

  if (!targetSnap.exists()) {
    return {
      ok: false,
      message: 'لم يسجل هذا الصديق الدخول باللعبة بعد. اطلب منه فتح الرابط وتسجيل الدخول بجوجل أولاً.',
    };
  }

  const targetData = targetSnap.data();
  const friendUid = String(targetData.uid);
  const rawCallsign = String(targetData.callsign || 'مقاتل').trim().slice(0, 24);
  const callsign = rawCallsign.length >= 2 ? rawCallsign : 'مقاتل_1';

  const friendRef = doc(db, 'users', user.uid, 'friends', friendUid);
  try {
    await setDoc(friendRef, {
      friendUid,
      callsign,
      addedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/friends/${friendUid}`);
  }

  return { ok: true, friend: { friendUid, callsign } };
}

export async function removeFriend(user: User, friendUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'friends', friendUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/friends/${friendUid}`);
  }
}

export function subscribeFriends(
  user: User,
  onChange: (friends: FriendRecord[]) => void,
): Unsubscribe {
  const colRef = collection(db, 'users', user.uid, 'friends');
  return onSnapshot(
    colRef,
    (snap) => {
      const list: FriendRecord[] = snap.docs.map((d) => ({
        friendUid: String(d.data().friendUid || d.id),
        callsign: String(d.data().callsign || 'مقاتل'),
      }));
      onChange(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/friends`);
    },
  );
}

export async function sendRoomInvite(
  user: User,
  fromCallsign: string,
  toUid: string,
  roomCode: string,
  mapId: MapId,
): Promise<void> {
  const safeCallsign = fromCallsign.trim().slice(0, 24) || 'قائد';
  try {
    await addDoc(collection(db, 'invites'), {
      fromUid: user.uid,
      fromCallsign: safeCallsign.length >= 2 ? safeCallsign : 'قائد_1',
      toUid,
      roomCode: roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
      mapId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'invites');
  }
}

export function subscribeIncomingInvites(
  user: User,
  onChange: (invites: RoomInviteRecord[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'invites'),
    where('toUid', '==', user.uid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const invites: RoomInviteRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fromUid: String(data.fromUid),
          fromCallsign: String(data.fromCallsign),
          toUid: String(data.toUid),
          roomCode: String(data.roomCode),
          mapId: data.mapId as MapId,
          status: data.status as 'pending' | 'accepted' | 'declined',
        };
      });
      onChange(invites);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'invites');
    },
  );
}

export async function respondToInvite(
  inviteId: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  try {
    await updateDoc(doc(db, 'invites', inviteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `invites/${inviteId}`);
  }
}
