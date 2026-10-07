// Same plausibility rules as src/networking/Authority.ts (server copy — the server is the source of truth).
export function validateMatchReport(r, alreadyProcessed) {
  if (!r || !r.matchId || alreadyProcessed(r.matchId)) return { accepted: false, reason: 'duplicate' };
  if (!(r.duration > 0) || r.duration > 720) return { accepted: false, reason: 'duration' };
  const s = r.stats || {}, perMin = Math.max(1, r.duration / 60);
  if (s.goals > 12 * perMin || s.kills > 25 * perMin || s.damage > 120000 * perMin || s.captures > 60 * perMin) return { accepted: false, reason: 'implausible_stats' };
  if (!Array.isArray(r.score) || r.score[0] < 0 || r.score[1] < 0 || r.score[0] + r.score[1] > 40 * perMin) return { accepted: false, reason: 'implausible_score' };
  const my = r.score[r.myTeam], their = r.score[r.myTeam === 0 ? 1 : 0];
  const pve = r.mode === 'RIFT_BOSS' || r.mode === 'SURVIVAL';
  if (!pve && r.outcome === 'win' && my <= their) return { accepted: false, reason: 'outcome_mismatch' };
  if (!pve && r.outcome === 'loss' && my >= their) return { accepted: false, reason: 'outcome_mismatch' };
  if (!pve && r.duration < 20 && r.outcome !== 'loss') return { accepted: false, reason: 'too_short' };
  return { accepted: true };
}
