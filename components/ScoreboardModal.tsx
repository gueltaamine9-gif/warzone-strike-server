import { Trophy, RotateCcw, Home, Skull, Crosshair } from 'lucide-react';
import { getOutfitSpec, type CombatantStats } from '../game/types';
import { TRANSLATIONS, type AppLang } from '../i18n/translations';

interface ScoreboardModalProps {
  rankings: CombatantStats[];
  isHost: boolean;
  isOnline: boolean;
  lang: AppLang;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export function ScoreboardModal({
  rankings,
  isHost,
  isOnline,
  lang,
  onPlayAgain,
  onBackToLobby,
}: ScoreboardModalProps) {
  const t = TRANSLATIONS[lang];
  const mvp = rankings[0];
  const mostDeaths = [...rankings].sort((a, b) => b.deaths - a.deaths)[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#11151c] border border-white/10 rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#161b24]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{t.finalRankings}</h2>
              <p className="text-xs text-gray-400">{t.rankingsSubtitle}</p>
            </div>
          </div>
          {mvp && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-300">
              <div className="flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-amber-400" />
                <span>{t.topKiller}</span>
                <strong className="text-amber-300">
                  {mvp.name} ({mvp.kills})
                </strong>
              </div>
              {mostDeaths && mostDeaths.deaths > 0 && (
                <div className="flex items-center gap-1.5">
                  <Skull className="w-4 h-4 text-red-400" />
                  <span>{t.mostDeaths}</span>
                  <strong className="text-red-300">
                    {mostDeaths.name} ({mostDeaths.deaths})
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-white/10">
                <th className="py-2.5 px-3 font-semibold">{t.colRank}</th>
                <th className="py-2.5 px-3 font-semibold">{t.colFighter}</th>
                <th className="py-2.5 px-3 font-semibold text-center">{t.colKills}</th>
                <th className="py-2.5 px-3 font-semibold text-center">{t.colDeaths}</th>
                <th className="py-2.5 px-3 font-semibold text-center">{t.colKD}</th>
                <th className="py-2.5 px-3 font-semibold text-center">{t.colDamage}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {rankings.map((row, index) => {
                const kd =
                  row.deaths === 0
                    ? row.kills.toFixed(1)
                    : (row.kills / row.deaths).toFixed(2);
                const outfit = getOutfitSpec(row.outfitId);
                return (
                  <tr
                    key={row.id}
                    className={
                      row.isSelf
                        ? 'bg-amber-500/12 text-white'
                        : index === 0
                          ? 'bg-emerald-500/8 text-gray-100'
                          : 'text-gray-300 hover:bg-white/[0.03]'
                    }
                  >
                    <td className="py-2.5 px-3 font-mono-num font-bold">
                      {index === 0 ? '1 ★' : index + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{row.name}</span>
                        <span className="text-[11px] text-gray-400">
                          {row.isSelf ? t.you : row.isBot ? t.botTag : t.playerTag}
                          {' · '}
                          {outfit.nameAr}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num font-bold text-emerald-400">
                      {row.kills}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num text-red-400">
                      {row.deaths}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num text-amber-300">
                      {kd}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-num text-gray-300">
                      {row.damage}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-[#161b24] flex items-center justify-between gap-3">
          <button
            onClick={onBackToLobby}
            className="px-4 py-2.5 rounded-lg bg-white/8 hover:bg-white/15 text-gray-200 text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Home className="w-4 h-4" />
            {t.backToLobby}
          </button>

          {(!isOnline || isHost) && (
            <button
              onClick={onPlayAgain}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              {t.playAgain}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
