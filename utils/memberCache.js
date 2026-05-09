// ── Cache membres centralisé ──────────────────────────────────────────────────
// Évite le rate limit Discord (opcode 8) en ne fetchant qu'une fois toutes les 10 min.

const TTL = 10 * 60 * 1000; // 10 minutes
const _lastFetch = new Map(); // guildId → timestamp

// Appelé par index.js après le fetch initial au démarrage
function markFetched(guildId) {
    _lastFetch.set(guildId, Date.now());
}

async function ensureMembersCache(guild) {
    const now  = Date.now();
    const last = _lastFetch.get(guild.id) ?? 0;
    if (now - last < TTL) return; // cache encore frais, on ne refetch pas
    await guild.members.fetch();
    _lastFetch.set(guild.id, Date.now());
    console.log(`[CACHE] Membres re-fetchés pour ${guild.name}.`);
}

module.exports = { ensureMembersCache, markFetched };
