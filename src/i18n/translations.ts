export type AppLang = 'ar' | 'fr' | 'en';

export interface TranslationDict {
  gameTitle: string;
  serverReady: string;
  connectingServer: string;
  googleLogin: string;
  loggingIn: string;
  logout: string;
  settings: string;
  language: string;
  sensitivity: string;
  soundEffects: string;
  enabled: string;
  muted: string;
  close: string;
  callsignLabel: string;
  callsignPlaceholder: string;
  tabClothing: string;
  tabWeapons: string;
  tabEmotes: string;
  charactersTitle: string;
  importGlbBtn: string;
  importingGlb: string;
  flipModelBtn: string;
  applyToBotsLabel: string;
  glbHint: string;
  glbInvalidError: string;
  outfitTitle: string;
  helmetTitle: string;
  primaryWeapon: string;
  secondaryWeapon: string;
  emotesHint: string;
  dragHint: string;
  selectedMap: string;
  offlineMode: string;
  onlineMode: string;
  chooseMap: string;
  matchDuration: string;
  botCountLabel: string;
  fightersUnit: string;
  startBattleNow: string;
  createOnlineRoom: string;
  enterRoomCode: string;
  joinBtn: string;
  roomCodeLabel: string;
  copyLink: string;
  copied: string;
  shareAndroid: string;
  leaveRoom: string;
  connectedPlayers: string;
  extraBots: string;
  startGroupMatch: string;
  waitingHost: string;
  inviteGoogleFriends: string;
  loginToInvite: string;
  friendEmailPlaceholder: string;
  addBtn: string;
  inviteBtn: string;
  sentBtn: string;
  createRoomFirst: string;
  noFriendsHint: string;
  leader: string;
  ready: string;
  you: string;
  // In-game HUD
  timeLabel: string;
  openTime: string;
  killsLabel: string;
  aliveLabel: string;
  leaderboardBtn: string;
  emotesBtn: string;
  endAndRank: string;
  jump: string;
  crouch: string;
  prone: string;
  fire: string;
  punch: string;
  scope: string;
  reload: string;
  reloading: string;
  grenade: string;
  holdToAimGrenade: string;
  pickupWeapon: string;
  useElevatorUp: string;
  useElevatorDown: string;
  callElevatorUp: string;
  callElevatorDown: string;
  launchJumpPad: string;
  rideCarpet: string;
  dismountCarpet: string;
  carpetAscend: string;
  carpetDescend: string;
  parachutingLabel: string;
  customizeHudBtn: string;
  customizeHudHint: string;
  resetHudBtn: string;
  saveHudBtn: string;
  cancelBtn: string;
  buttonSizeLabel: string;
  topHudSizeLabel: string;
  buttonsSizeLabel: string;
  eliminated: string;
  respawningIn: string;
  enemyDot: string;
  weaponDot: string;
  elevatorDot: string;
  // Scoreboard
  finalRankings: string;
  rankingsSubtitle: string;
  topKiller: string;
  mostDeaths: string;
  colRank: string;
  colFighter: string;
  colKills: string;
  colDeaths: string;
  colKD: string;
  colDamage: string;
  backToLobby: string;
  playAgain: string;
  botTag: string;
  playerTag: string;
  // Grenades, Vehicles, Teams & Chat
  fragGrenade: string;
  smokeGrenade: string;
  molotovGrenade: string;
  holdSwitchGrenadeHint: string;
  pickupGrenades: string;
  driveCar: string;
  driveMotorcycle: string;
  ridePassenger: string;
  exitVehicle: string;
  freeForAllMode: string;
  teamsMode: string;
  greenTeam: string;
  redTeam: string;
  chatBtn: string;
  chatPlaceholder: string;
  sendChatBtn: string;
  quickChat1: string;
  quickChat2: string;
  quickChat3: string;
}

export const TRANSLATIONS: Record<AppLang, TranslationDict> = {
  ar: {
    gameTitle: 'ساحة القتال التكتيكية',
    serverReady: 'خادم الأونلاين جاهز',
    connectingServer: 'جاري الاتصال بالخادم',
    googleLogin: 'تسجيل الدخول بجوجل',
    loggingIn: 'جاري الدخول...',
    logout: 'تسجيل الخروج',
    settings: 'الإعدادات',
    language: 'اللغة',
    sensitivity: 'حساسية الكاميرا',
    soundEffects: 'المؤثرات الصوتية',
    enabled: 'مفعّلة',
    muted: 'مكتومة',
    close: 'إغلاق',
    callsignLabel: 'اسم المقاتل',
    callsignPlaceholder: 'اكتب اسمك العسكري...',
    tabClothing: 'الشخصيات',
    tabWeapons: 'الأسلحة',
    tabEmotes: 'الرقصات',
    charactersTitle: 'الشخصيات العسكرية المدمجة',
    importGlbBtn: 'استيراد شخصية .GLB من الهاتف / الكمبيوتر',
    importingGlb: 'جاري قراءة النموذج...',
    flipModelBtn: 'عكس اتجاه الوجه 180°',
    applyToBotsLabel: 'تطبيق على المقاتلين أيضاً',
    glbHint: 'يدعم ملفات GLB/GLTF ثلاثية الأبعاد وتعمل مباشرة بالقتال',
    glbInvalidError: 'تعذر قراءة الملف — تأكد أنه بصيغة .glb أو .gltf صالحة',
    outfitTitle: 'الزي العسكري والتمويه',
    helmetTitle: 'الخوذة وغطاء الرأس',
    primaryWeapon: 'السلاح الأساسي',
    secondaryWeapon: 'السلاح الثانوي (التبديل السريع 2)',
    emotesHint: 'اضغط على أي رقصة لتجربتها على مقاتلك:',
    dragHint: 'اسحب الشخصية للمعاينة · الخريطة:',
    selectedMap: 'الخريطة المختارة',
    offlineMode: 'لعب أوفلاين',
    onlineMode: 'أونلاين مع الأصدقاء',
    chooseMap: 'اختر المدينة / ساحة القتال (4 خرائط)',
    matchDuration: 'مدة المعركة',
    botCountLabel: 'عدد المقاتلين (بدون إنترنت)',
    fightersUnit: 'مقاتل',
    startBattleNow: 'بدء المعركة الآن',
    createOnlineRoom: 'إنشاء غرفة لعب أونلاين',
    enterRoomCode: 'أدخل رمز الغرفة...',
    joinBtn: 'دخول',
    roomCodeLabel: 'رمز الغرفة المباشرة',
    copyLink: 'نسخ الرابط',
    copied: 'تم النسخ',
    shareAndroid: 'مشاركة',
    leaveRoom: 'مغادرة',
    connectedPlayers: 'المتصلون في الغرفة',
    extraBots: 'بوتات إضافية بالخريطة:',
    startGroupMatch: 'بدء المعركة الجماعية',
    waitingHost: 'بانتظار القائد لبدء المعركة...',
    inviteGoogleFriends: 'دعوة الأصدقاء عبر جوجل',
    loginToInvite: 'سجّل بجوجل لإضافة ودعوة أصدقائك',
    friendEmailPlaceholder: 'بريد جوجل لصديقك...',
    addBtn: 'إضافة',
    inviteBtn: 'دعوة',
    sentBtn: 'أُرسلت!',
    createRoomFirst: 'أنشئ غرفة',
    noFriendsHint: 'أضف بريد صديقك أو شارك رابط الغرفة معه مباشرة.',
    leader: 'القائد',
    ready: 'جاهز',
    you: 'أنت',
    timeLabel: 'الوقت:',
    openTime: 'وقت مفتوح',
    killsLabel: 'القتل:',
    aliveLabel: 'الأحياء:',
    leaderboardBtn: 'الترتيب',
    emotesBtn: 'رقصات',
    endAndRank: 'إنهاء وترتيب',
    jump: 'قفز',
    crouch: 'انحناء',
    prone: 'استلقاء',
    fire: 'إطلاق',
    punch: 'لكمة',
    scope: 'منظار',
    reload: 'تعبئة',
    reloading: 'جاري...',
    grenade: 'قنبلة',
    holdToAimGrenade: 'وجّه الكاميرا ثم اترك الزر للرمي',
    pickupWeapon: 'التقاط السلاح',
    useElevatorUp: 'صعود بالمصعد للسطح ▲ (F)',
    useElevatorDown: 'نزول بالمصعد للأسفل ▼ (F)',
    callElevatorUp: 'استدعاء المصعد للأعلى ▲ (F)',
    callElevatorDown: 'استدعاء المصعد للأسفل ▼ (F)',
    launchJumpPad: 'إطلاق للسقف المقابل ↗ (F)',
    rideCarpet: 'ركوب الحصيرة الطائرة (F)',
    dismountCarpet: 'النزول من الحصيرة (F)',
    carpetAscend: 'صعود للأعلى ▲',
    carpetDescend: 'نزول للأسفل ▼',
    parachutingLabel: 'هبوط بالمظلة (الباراشوت)',
    customizeHudBtn: 'تخصيص أماكن وحجم الأزرار',
    customizeHudHint: 'اسحب أي زر للمكان الذي يناسبك على الشاشة ثم اضغط حفظ',
    resetHudBtn: 'استعادة الافتراضي',
    saveHudBtn: 'حفظ التخطيط',
    cancelBtn: 'إلغاء',
    buttonSizeLabel: 'حجم الزر المحدد',
    topHudSizeLabel: 'حجم الخريطة والقوائم (أعلى وأسفل)',
    buttonsSizeLabel: 'حجم أزرار اللعب',
    eliminated: 'تم إقصاؤك',
    respawningIn: 'إعادة الانتشار خلال',
    enemyDot: 'عدو',
    weaponDot: 'سلاح',
    elevatorDot: 'مصعد',
    finalRankings: 'الترتيب النهائي للمعركة',
    rankingsSubtitle: 'الترتيب حسب الأكثر قتلاً والأقل موتاً وإجمالي الضرر',
    topKiller: 'الأكثر قتلاً:',
    mostDeaths: 'الأكثر موتاً:',
    colRank: 'المركز',
    colFighter: 'المقاتل',
    colKills: 'القتل',
    colDeaths: 'الموت',
    colKD: 'نسبة K/D',
    colDamage: 'الضرر',
    backToLobby: 'العودة للوبي',
    playAgain: 'لعب جولة جديدة',
    botTag: 'مقاتل ذكي',
    playerTag: 'لاعب',
    fragGrenade: 'قنبلة عادية',
    smokeGrenade: 'قنبلة دخانية',
    molotovGrenade: 'قنبلة حارقة',
    holdSwitchGrenadeHint: 'اضغط مرة لاختيار القنبلة · اضغط مطولاً وحرّك الشاشة للرمي',
    pickupGrenades: 'التقاط قنابل',
    driveCar: 'قيادة السيارة (F)',
    driveMotorcycle: 'قيادة الدراجة النارية (F)',
    ridePassenger: 'ركوب مع صديقك (F)',
    exitVehicle: 'نزول من المركبة (F)',
    freeForAllMode: 'الكل ضد الكل',
    teamsMode: 'فريق أخضر vs أحمر',
    greenTeam: 'الفريق الأخضر',
    redTeam: 'الفريق الأحمر',
    chatBtn: 'محادثة',
    chatPlaceholder: 'اكتب رسالة لأصدقائك...',
    sendChatBtn: 'إرسال',
    quickChat1: 'تعال اركب معي!',
    quickChat2: 'غطّني سأتقدم!',
    quickChat3: 'عدو أمامنا!',
  },
  fr: {
    gameTitle: 'Zone de Combat Tactique',
    serverReady: 'Serveur en ligne prêt',
    connectingServer: 'Connexion au serveur...',
    googleLogin: 'Connexion Google',
    loggingIn: 'Connexion...',
    logout: 'Déconnexion',
    settings: 'Paramètres',
    language: 'Langue',
    sensitivity: 'Sensibilité caméra',
    soundEffects: 'Effets sonores',
    enabled: 'Activés',
    muted: 'Muet',
    close: 'Fermer',
    callsignLabel: 'Nom du soldat',
    callsignPlaceholder: 'Votre nom tactique...',
    tabClothing: 'Soldats',
    tabWeapons: 'Armes',
    tabEmotes: 'Danses',
    charactersTitle: 'Soldats tactiques intégrés',
    importGlbBtn: 'Importer un personnage .GLB (Mobile / PC)',
    importingGlb: 'Chargement du modèle...',
    flipModelBtn: 'Inverser l’orientation 180°',
    applyToBotsLabel: 'Appliquer aussi aux bots',
    glbHint: 'Prend en charge les modèles GLB/GLTF 3D en combat réel',
    glbInvalidError: 'Fichier invalide — veuillez choisir un .glb ou .gltf valide',
    outfitTitle: 'Uniforme & Camouflage',
    helmetTitle: 'Casque & Équipement',
    primaryWeapon: 'Arme principale',
    secondaryWeapon: 'Arme secondaire (Touche 2)',
    emotesHint: 'Appuyez sur une danse pour l’aperçu 3D :',
    dragHint: 'Glissez le soldat · Carte :',
    selectedMap: 'Carte sélectionnée',
    offlineMode: 'Hors-ligne (Bots)',
    onlineMode: 'En ligne (Amis)',
    chooseMap: 'Choisir la zone de combat (4 cartes)',
    matchDuration: 'Durée du match',
    botCountLabel: 'Nombre de combattants',
    fightersUnit: 'soldats',
    startBattleNow: 'Lancer le combat',
    createOnlineRoom: 'Créer un salon en ligne',
    enterRoomCode: 'Code du salon...',
    joinBtn: 'Rejoindre',
    roomCodeLabel: 'Code du salon',
    copyLink: 'Copier le lien',
    copied: 'Copié !',
    shareAndroid: 'Partager',
    leaveRoom: 'Quitter',
    connectedPlayers: 'Joueurs connectés',
    extraBots: 'Bots IA en plus :',
    startGroupMatch: 'Démarrer la partie',
    waitingHost: 'En attente du chef de salon...',
    inviteGoogleFriends: 'Inviter des amis via Google',
    loginToInvite: 'Connectez-vous avec Google pour inviter',
    friendEmailPlaceholder: 'Email Google de votre ami...',
    addBtn: 'Ajouter',
    inviteBtn: 'Inviter',
    sentBtn: 'Envoyé !',
    createRoomFirst: 'Créer salon',
    noFriendsHint: 'Ajoutez un ami par email ou partagez le lien du salon.',
    leader: 'Chef',
    ready: 'Prêt',
    you: 'Vous',
    timeLabel: 'Temps :',
    openTime: 'Illimité',
    killsLabel: 'Élim. :',
    aliveLabel: 'En vie :',
    leaderboardBtn: 'Classement',
    emotesBtn: 'Danses',
    endAndRank: 'Terminer',
    jump: 'Saut',
    crouch: 'Baisser',
    prone: 'Allonger',
    fire: 'Tirer',
    punch: 'Coup',
    scope: 'Viseur',
    reload: 'Recharger',
    reloading: 'Charg...',
    grenade: 'Grenade',
    holdToAimGrenade: 'Visez puis relâchez pour lancer',
    pickupWeapon: 'Prendre',
    useElevatorUp: 'Monter ascenseur ▲ (F)',
    useElevatorDown: 'Descendre ascenseur ▼ (F)',
    callElevatorUp: 'Appeler ascenseur ▲ (F)',
    callElevatorDown: 'Appeler ascenseur ▼ (F)',
    launchJumpPad: 'Sauter vers le toit ↗ (F)',
    rideCarpet: 'Monter sur le Tapis Volant (F)',
    dismountCarpet: 'Descendre du tapis (F)',
    carpetAscend: 'Monter ▲',
    carpetDescend: 'Descendre ▼',
    parachutingLabel: 'Parachute ouvert',
    customizeHudBtn: 'Personnaliser les boutons',
    customizeHudHint: 'Glissez chaque bouton où vous voulez puis enregistrez',
    resetHudBtn: 'Réinitialiser',
    saveHudBtn: 'Enregistrer',
    cancelBtn: 'Annuler',
    buttonSizeLabel: 'Taille du bouton',
    topHudSizeLabel: 'Taille du radar et barres (haut/bas)',
    buttonsSizeLabel: 'Taille des boutons de jeu',
    eliminated: 'Éliminé',
    respawningIn: 'Réapparition dans',
    enemyDot: 'Ennemi',
    weaponDot: 'Arme',
    elevatorDot: 'Ascenseur',
    finalRankings: 'Classement final du combat',
    rankingsSubtitle: 'Classé par éliminations, décès et dégâts infligés',
    topKiller: 'Meilleur tireur :',
    mostDeaths: 'Plus de décès :',
    colRank: 'Rang',
    colFighter: 'Soldat',
    colKills: 'Élim.',
    colDeaths: 'Morts',
    colKD: 'Ratio K/D',
    colDamage: 'Dégâts',
    backToLobby: 'Retour au salon',
    playAgain: 'Rejouer',
    botTag: 'Bot Tactique',
    playerTag: 'Joueur',
    fragGrenade: 'Grenade Frag',
    smokeGrenade: 'Fumigène',
    molotovGrenade: 'Cocktail Molotov',
    holdSwitchGrenadeHint: 'Appuyez pour choisir · Maintenez et glissez pour lancer',
    pickupGrenades: 'Prendre grenades',
    driveCar: 'Conduire voiture (F)',
    driveMotorcycle: 'Conduire moto (F)',
    ridePassenger: 'Monter passager (F)',
    exitVehicle: 'Sortir du véhicule (F)',
    freeForAllMode: 'Chacun pour soi',
    teamsMode: 'Équipe Verte vs Rouge',
    greenTeam: 'Équipe Verte',
    redTeam: 'Équipe Rouge',
    chatBtn: 'Chat',
    chatPlaceholder: 'Message aux amis...',
    sendChatBtn: 'Envoyer',
    quickChat1: 'Monte avec moi !',
    quickChat2: 'Couvre-moi !',
    quickChat3: 'Ennemi devant !',
  },
  en: {
    gameTitle: 'Warzone Tactical 3D',
    serverReady: 'Online Server Ready',
    connectingServer: 'Connecting...',
    googleLogin: 'Sign in with Google',
    loggingIn: 'Signing in...',
    logout: 'Sign Out',
    settings: 'Settings',
    language: 'Language',
    sensitivity: 'Camera Sensitivity',
    soundEffects: 'Sound Effects',
    enabled: 'Enabled',
    muted: 'Muted',
    close: 'Close',
    callsignLabel: 'Soldier Callsign',
    callsignPlaceholder: 'Enter soldier name...',
    tabClothing: 'Soldiers',
    tabWeapons: 'Weapons',
    tabEmotes: 'Dances',
    charactersTitle: 'Built-in Military Operators',
    importGlbBtn: 'Import .GLB Character (Phone / PC)',
    importingGlb: 'Loading 3D model...',
    flipModelBtn: 'Flip Facing 180°',
    applyToBotsLabel: 'Apply to AI fighters too',
    glbHint: 'Supports 3D GLB/GLTF characters directly in battle',
    glbInvalidError: 'Invalid model file — please choose a valid .glb or .gltf',
    outfitTitle: 'Military Uniform & Camo',
    helmetTitle: 'Helmet & Headgear',
    primaryWeapon: 'Primary Weapon',
    secondaryWeapon: 'Secondary Weapon (Slot 2)',
    emotesHint: 'Tap an emote to preview on your soldier:',
    dragHint: 'Drag soldier to rotate · Map:',
    selectedMap: 'Selected Map',
    offlineMode: 'Offline (Bots)',
    onlineMode: 'Online Friends',
    chooseMap: 'Select Combat City (4 Maps)',
    matchDuration: 'Match Duration',
    botCountLabel: 'Combatants (Offline)',
    fightersUnit: 'soldiers',
    startBattleNow: 'Deploy to Battle',
    createOnlineRoom: 'Create Online Room',
    enterRoomCode: 'Enter room code...',
    joinBtn: 'Join',
    roomCodeLabel: 'Live Room Code',
    copyLink: 'Copy Link',
    copied: 'Copied!',
    shareAndroid: 'Share',
    leaveRoom: 'Leave',
    connectedPlayers: 'Players in Room',
    extraBots: 'Extra AI Bots:',
    startGroupMatch: 'Start Squad Match',
    waitingHost: 'Waiting for host to deploy...',
    inviteGoogleFriends: 'Invite Friends via Google',
    loginToInvite: 'Sign in with Google to invite friends',
    friendEmailPlaceholder: "Friend's Google email...",
    addBtn: 'Add',
    inviteBtn: 'Invite',
    sentBtn: 'Sent!',
    createRoomFirst: 'Create Room',
    noFriendsHint: 'Add a friend by email or share your room link directly.',
    leader: 'Host',
    ready: 'Ready',
    you: 'You',
    timeLabel: 'Time:',
    openTime: 'Open Time',
    killsLabel: 'Kills:',
    aliveLabel: 'Alive:',
    leaderboardBtn: 'Ranks',
    emotesBtn: 'Emotes',
    endAndRank: 'Finish',
    jump: 'Jump',
    crouch: 'Crouch',
    prone: 'Prone',
    fire: 'Fire',
    punch: 'Punch',
    scope: 'Scope',
    reload: 'Reload',
    reloading: 'Reload...',
    grenade: 'Grenade',
    holdToAimGrenade: 'Aim & release to throw grenade',
    pickupWeapon: 'Pick Up',
    useElevatorUp: 'Take Elevator to Roof ▲ (F)',
    useElevatorDown: 'Take Elevator Down ▼ (F)',
    callElevatorUp: 'Call Elevator Up ▲ (F)',
    callElevatorDown: 'Call Elevator Down ▼ (F)',
    launchJumpPad: 'Launch to Opposite Roof ↗ (F)',
    rideCarpet: 'Ride Flying Carpet (F)',
    dismountCarpet: 'Dismount Carpet (F)',
    carpetAscend: 'Fly Up ▲',
    carpetDescend: 'Fly Down ▼',
    parachutingLabel: 'Parachuting',
    customizeHudBtn: 'Customize HUD Buttons',
    customizeHudHint: 'Drag any button anywhere on screen and tap Save',
    resetHudBtn: 'Reset Default',
    saveHudBtn: 'Save Layout',
    cancelBtn: 'Cancel',
    buttonSizeLabel: 'Selected Button Size',
    topHudSizeLabel: 'Radar & Info Bars Size (Top/Bottom)',
    buttonsSizeLabel: 'Gameplay Buttons Size',
    eliminated: 'Eliminated',
    respawningIn: 'Respawning in',
    enemyDot: 'Enemy',
    weaponDot: 'Weapon',
    elevatorDot: 'Elevator',
    finalRankings: 'Final Battle Rankings',
    rankingsSubtitle: 'Ranked by most kills, fewest deaths, and total damage',
    topKiller: 'Top Eliminator:',
    mostDeaths: 'Most Deaths:',
    colRank: 'Rank',
    colFighter: 'Soldier',
    colKills: 'Kills',
    colDeaths: 'Deaths',
    colKD: 'K/D',
    colDamage: 'Damage',
    backToLobby: 'Back to Lobby',
    playAgain: 'Play Again',
    botTag: 'Tactical AI',
    playerTag: 'Player',
    fragGrenade: 'Frag Grenade',
    smokeGrenade: 'Smoke Grenade',
    molotovGrenade: 'Molotov',
    holdSwitchGrenadeHint: 'Tap to switch grenade · Hold & drag screen to aim throw',
    pickupGrenades: 'Pick Up Grenades',
    driveCar: 'Drive Car (F)',
    driveMotorcycle: 'Ride Motorcycle (F)',
    ridePassenger: 'Ride Passenger (F)',
    exitVehicle: 'Exit Vehicle (F)',
    freeForAllMode: 'Free-For-All',
    teamsMode: 'Green vs Red Teams',
    greenTeam: 'Green Team',
    redTeam: 'Red Team',
    chatBtn: 'Chat',
    chatPlaceholder: 'Message squad...',
    sendChatBtn: 'Send',
    quickChat1: 'Get in with me!',
    quickChat2: 'Cover me!',
    quickChat3: 'Enemy ahead!',
  },
};
