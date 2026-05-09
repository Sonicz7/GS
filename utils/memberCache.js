// ── Cache membres centralisé ──────────────────────────────────────────────────
// Évite le rate limit Discord (opcode 8) en ne fetchant qu'une fois toutes les 10 min.
// À utiliser dans tout le projet à la place de guild.members.fetch().

const TTL = 10 * 60 * 1000; // 10 minutes
const _lastFetch = new Map(); // guildId → timestamp

async function ensureMembersCache(guild) {
    const now  = Date.now();
    const last = _lastFetch.get(guild.id) ?? 0;
    if (now - last < TTL) return;
    await guild.members.fetch();
    _lastFetch.set(guild.id, now);
    console.log(`[CACHE] Membres fetchés pour ${guild.name}.`);
}

module.exports = { ensureMembersCache };
