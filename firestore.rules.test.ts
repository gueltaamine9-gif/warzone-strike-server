// Adversarial Dirty Dozen security rule verification specification
export const DIRTY_DOZEN_PAYLOADS = [
  { name: 'shadowFieldProfile', path: '/users/u1', payload: { uid: 'u1', callsign: 'Alpha', isAdmin: true } },
  { name: 'identitySpoofProfile', path: '/users/u1', payload: { uid: 'u2', callsign: 'Alpha' } },
  { name: 'oversizedCallsign', path: '/users/u1', payload: { uid: 'u1', callsign: 'A'.repeat(256) } },
  { name: 'unverifiedEmailWrite', path: '/users/u1', auth: { uid: 'u1', email_verified: false } },
  { name: 'piiCrossRead', path: '/users/u1/private/info', auth: { uid: 'u2' } },
  { name: 'directoryScrapeList', path: '/directory', op: 'list' },
  { name: 'inviteSenderSpoof', path: '/invites/inv1', payload: { fromUid: 'u2', toUid: 'u3', status: 'pending' } },
  { name: 'inviteStateShortcut', path: '/invites/inv1', payload: { fromUid: 'u1', toUid: 'u2', status: 'accepted' } },
  { name: 'inviteTerminalRevert', path: '/invites/inv1', op: 'update', payload: { status: 'pending' } },
  { name: 'inviteRoomCodePoison', path: '/invites/inv1', payload: { roomCode: '<bad>' } },
  { name: 'backdatedTimestamp', path: '/invites/inv1', payload: { createdAt: '2020-01-01T00:00:00Z' } },
  { name: 'orphanedFriendSubdoc', path: '/users/missingUser/friends/u2', payload: { friendUid: 'u2', callsign: 'Ghost' } },
];
