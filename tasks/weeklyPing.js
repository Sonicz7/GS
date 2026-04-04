const { categories, channels, guildId, gsHierarchy, roles } = require('../config');

function msUntilNext(targetDay, targetHour) {
    const now  = new Date();
    const next = new Date();
    next.setHours(targetHour, 0, 0, 0);
    let daysUntil = (targetDay - now.getDay() + 7) % 7;
    if (daysUntil === 0 && now >= next) daysUntil = 7;
    next.setDate(now.getDate() + daysUntil);
    return next.getTime() - now.getTime();
}

function getWeekLabel() {
    const now  = new Date();
    const day  = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const start = new Date(now); start.setDate(now.getDate() + diff);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    const fmt   = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `${fmt(start)} – ${fmt(end)}`;
}

// ── Récupère les réponses depuis le salon rp- ────────────────────────────────
async function fetchAnswers(channel, type) {
    const { QUESTIONS_NOTES, QUESTIONS_ECRITES } = require('../handlers/interactionCreate');
    const messages = await channel.messages.fetch({ limit: 100 });

    for (const msg of messages.values()) {
        if (!msg.author.bot || !msg.embeds?.length) continue;
        const embed = msg.embeds[0];
        const title = embed.title || '';

        if (type === 'rapport' && title.includes('Rapport hebdomadaire complété')) {
            const notes = {}, ecrit = {};
            for (const field of (embed.fields || [])) {
                if (QUESTIONS_NOTES.includes(field.name))   notes[field.name] = field.value.replace(/\*\*/g, '').replace('/5', '');
                if (QUESTIONS_ECRITES.includes(field.name)) ecrit[field.name] = field.value;
            }
            return { notes, ecrit };
        }

        if (type === 'stats' && title.includes('Stats & Heures de voc complétées')) {
            // Les stats sont dans la description format ```\nTickets : X\nVocal : Y\n```
            const desc = embed.description || '';
            const ticketsMatch = desc.match(/Tickets\s*:\s*(.+)/);
            const vocalMatch   = desc.match(/Vocal\s*:\s*(.+)/);
            return {
                tickets: ticketsMatch ? ticketsMatch[1].trim() : '—',
                vocal:   vocalMatch   ? vocalMatch[1].trim()   : '—',
            };
        }
    }
    return null;
}

// ── Vérification completion ───────────────────────────────────────────────────
async function getCompletion(channel) {
    const messages = await channel.messages.fetch({ limit: 50 });
    let rapport = false;

    for (const msg of messages.values()) {
        if (!msg.author.bot || !msg.components?.length) continue;
        for (const row of msg.components) {
            for (const btn of row.components) {
                const id = btn.customId || '';
                if (id.startsWith('rapport_') && btn.style === 3) rapport = true;
            }
        }
    }
    return { rapport };
}

// Helper : trouve l'overwrite membre dans un salon rp-
function getMemberOverwrite(channel, guild) {
    return [...channel.permissionOverwrites.cache.values()].find(ow => {
        const m = guild.members.cache.get(ow.id);
        return m && !m.user.bot;
    });
}

// ── Ping 10h ──────────────────────────────────────────────────────────────────
async function sendWeeklyPings(client) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return console.warn('[WEEKLY] Guild introuvable.');

    const category = guild.channels.cache.get(categories.rapportsPersonnels);
    if (!category) return console.warn('[WEEKLY] Catégorie rapports introuvable.');

    const rapportChannels = guild.channels.cache.filter(c => c.parentId === category.id && c.name.startsWith('rp-'));
    if (!rapportChannels.size) return;

    const week = getWeekLabel();

    for (const [, channel] of rapportChannels) {
        try {
            const ow = getMemberOverwrite(channel, guild);
            if (!ow) continue;

            const embed = new EmbedBuilder()
                .setTitle(`Récap hebdomadaire — ${week}`)
                .setDescription(
                    `<@${ow.id}>, il est temps de remplir ton rapport de la semaine.\n\n` +
                    'Clique sur le bouton ci-dessous pour compléter ton rapport.\n' +
                    'Une fois validé, le bouton passera au vert.'
                )
                .setColor(0x2260da)
                .setFooter({ text: 'À compléter avant 17h.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rapport_${ow.id}`).setLabel('Rapport').setStyle(ButtonStyle.Secondary),
            );

            await channel.send({
    content: `<@${ow.id}>`,
    embeds: [embed],
    components: [row],
});
        } catch (err) {
            console.error(`[WEEKLY] Erreur sur ${channel.name} :`, err);
        }
    }
    console.log(`[WEEKLY] Pings envoyés — ${week}.`);
}

// ── Rappel 16h ────────────────────────────────────────────────────────────────
async function sendReminderAt16(client) {
    const { EmbedBuilder } = require('discord.js');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const category = guild.channels.cache.get(categories.rapportsPersonnels);
    if (!category) return;

    const rapportChannels = guild.channels.cache.filter(c => c.parentId === category.id && c.name.startsWith('rp-'));

    for (const [, channel] of rapportChannels) {
        try {
            const ow = getMemberOverwrite(channel, guild);
            if (!ow) continue;

            const completion = await getCompletion(channel);
            if (completion.rapport) continue;

            const embedContent = new EmbedBuilder()
                .setTitle('Rappel — Rapport hebdomadaire')
                .setDescription(
                    "Il te reste moins d'une heure pour compléter ton rapport.\n\n" +
                    `**Salon :** <#${channel.id}>`
                )
                .setColor(0xe67e22);

            try {
                const member = await guild.members.fetch(ow.id);
                await member.send({ embeds: [embedContent] });
            } catch {
                const sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(`<@${ow.id}> — Rappel : **rapport** manquant.`).setColor(0xe67e22)] });
                setTimeout(() => sent.delete().catch(() => {}), 60000);
            }
        } catch (err) {
            console.error(`[REMINDER] Erreur sur ${channel.name} :`, err);
        }
    }
}

// ── Récap 17h ─────────────────────────────────────────────────────────────────
async function sendRecapAt17(client) {
    const { EmbedBuilder } = require('discord.js');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const recapChannel = guild.channels.cache.get(channels.recap);
    if (!recapChannel) return console.warn('[RECAP] Salon recap introuvable.');

    const category = guild.channels.cache.get(categories.rapportsPersonnels);
    if (!category) return;

    const rapportChannels = guild.channels.cache.filter(c => c.parentId === category.id && c.name.startsWith('rp-'));
    const lines = [];

    for (const [, channel] of rapportChannels) {
        try {
            const ow = getMemberOverwrite(channel, guild);
            if (!ow) continue;
            const { rapport } = await getCompletion(channel);
            lines.push(`<@${ow.id}> — ${rapport ? '✅' : '❌'} Rapport`);
        } catch (err) {
            console.error(`[RECAP 17H] Erreur sur ${channel.name} :`, err);
        }
    }

    await recapChannel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle('Récap hebdomadaire — État des rapports')
                .setDescription(lines.join('\n') || 'Aucun salon rapport trouvé.')
                .setColor(0x2260da)
                .setFooter({ text: `Généré le ${new Date().toLocaleDateString('fr-FR')} à 17h` }),
        ],
    });
}

// ── Récap 18h — embed détaillé + HTML ────────────────────────────────────────
async function sendRecapAt18(client) {
    const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
    const { QUESTIONS_NOTES, QUESTIONS_ECRITES } = require('../handlers/interactionCreate');

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const recapChannel = guild.channels.cache.get(channels.recap);
    if (!recapChannel) return console.warn('[RECAP 18H] Salon recap introuvable.');

    const category = guild.channels.cache.get(categories.rapportsPersonnels);
    if (!category) return;

    await guild.members.fetch();

    const rapportChannels = guild.channels.cache.filter(c => c.parentId === category.id && c.name.startsWith('rp-'));
    if (!rapportChannels.size) return;

    const week = getWeekLabel();
    const membersData = [];

    for (const [, channel] of rapportChannels) {
        try {
            const ow     = getMemberOverwrite(channel, guild);
            if (!ow) continue;
            const member = guild.members.cache.get(ow.id);
            if (!member) continue;

            const completion      = await getCompletion(channel);
            const rapportAnswers  = completion.rapport ? await fetchAnswers(channel, 'rapport') : null;

            let rang = '📋 Gestion Staff';
            for (const r of gsHierarchy) {
                const roleId = roles[r.key];
                if (roleId && member.roles.cache.has(roleId)) { rang = r.label; break; }
            }

            membersData.push({
                id: member.id,
                username: member.user.username,
                displayName: member.displayName,
                avatarUrl: member.user.displayAvatarURL({ size: 128, extension: 'png' }),
                rang, completion, rapportAnswers,
            });
        } catch (err) {
            console.error(`[RECAP 18H] Erreur sur ${channel.name} :`, err);
        }
    }

    if (!membersData.length) return;

    // Embed récap
    const embedLines = membersData.map(m => {
        const r = m.completion.rapport ? '✅' : '❌';
        return `**${m.displayName}** (${m.rang}) — ${r} Rapport`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`📊 Récap GS détaillé — ${week}`)
        .setDescription(embedLines.join('\n\n'))
        .setColor(0x2260da)
        .setFooter({ text: `Généré le ${new Date().toLocaleDateString('fr-FR')} à 18h · ${membersData.length} membres` });

    // Fichier HTML
    const html = generateHtml(membersData, week, QUESTIONS_NOTES, QUESTIONS_ECRITES);
    const attachment = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
        name: `recap-gs-${week.replace(/\s/g, '').replace('–', '-')}.html`,
    });

    await recapChannel.send({ embeds: [embed], files: [attachment] });
    console.log(`[RECAP 18H] Récap envoyé — ${week}.`);
}

// ── Génération HTML ───────────────────────────────────────────────────────────
function generateHtml(membersData, week, QUESTIONS_NOTES, QUESTIONS_ECRITES) {
    const cards = membersData.map(m => {
        let rapportSection = '';
        if (m.completion.rapport && m.rapportAnswers) {
            const notesRows = QUESTIONS_NOTES.map(q => {
                const val = m.rapportAnswers.notes[q] || '—';
                const n   = parseInt(val);
                const stars = !isNaN(n) ? '★'.repeat(n) + '☆'.repeat(5 - n) : val;
                return `<tr><td class="q">${q}</td><td class="a note">${stars} <span class="num">${val}/5</span></td></tr>`;
            }).join('');
            const ecritRows = QUESTIONS_ECRITES.map(q => {
                const val = m.rapportAnswers.ecrit[q] || '—';
                return `<tr><td class="q">${q}</td><td class="a">${val}</td></tr>`;
            }).join('');
            rapportSection = `
            <div class="section-title">📋 Rapport hebdomadaire</div>
            <table class="answers-table">
                <thead><tr><th>Question</th><th>Réponse</th></tr></thead>
                <tbody>${notesRows}${ecritRows}</tbody>
            </table>`;
        } else {
            rapportSection = `<div class="missing">❌ Rapport non complété</div>`;
        }

        return `
        <div class="card">
            <div class="card-header">
                <img src="${m.avatarUrl}" alt="avatar" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
                <div class="card-info">
                    <div class="display-name">${m.displayName}</div>
                    <div class="username">@${m.username}</div>
                    <div class="rang-badge">${m.rang}</div>
                </div>
                <div class="status-badges">
                    <span class="badge ${m.completion.rapport ? 'ok' : 'ko'}">${m.completion.rapport ? '✅ Rapport' : '❌ Rapport'}</span>
                </div>
            </div>
            <div class="card-body">${rapportSection}</div>
        </div>`;
    }).join('\n');

    const total   = membersData.length;
    const done    = membersData.filter(m => m.completion.rapport).length;
    const miss    = membersData.filter(m => !m.completion.rapport).length;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>Récap GS — ${week}</title>
<style>
:root{--bg:#0e1117;--surface:#161b22;--surface2:#21262d;--border:#30363d;--accent:#2260da;--accent-light:#3b82f6;--text:#e6edf3;--text-muted:#8b949e;--star:#f0b429;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;}
header{background:linear-gradient(135deg,var(--accent),#1a3a7a);padding:32px 40px;border-bottom:1px solid var(--border);}
header h1{font-size:24px;font-weight:700;margin-bottom:6px;}
header p{color:rgba(255,255,255,.7);font-size:13px;}
.summary-bar{display:flex;gap:16px;padding:20px 40px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap;}
.summary-stat{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 20px;text-align:center;min-width:120px;}
.summary-stat .val{font-size:28px;font-weight:700;}
.summary-stat .lbl{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
.val.ok{color:#3fb950;}.val.partial{color:#f0b429;}.val.ko{color:#f85149;}
.container{max-width:900px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:24px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.card-header{display:flex;align-items:center;gap:16px;padding:20px 24px;background:var(--surface2);border-bottom:1px solid var(--border);}
.avatar{width:56px;height:56px;border-radius:50%;border:2px solid var(--accent);flex-shrink:0;}
.card-info{flex:1;}
.display-name{font-size:18px;font-weight:700;}
.username{color:var(--text-muted);font-size:12px;}
.rang-badge{display:inline-block;background:var(--accent);color:#fff;font-size:11px;font-weight:600;padding:2px 10px;border-radius:20px;margin-top:4px;}
.status-badges{display:flex;flex-direction:column;gap:6px;}
.badge{font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;white-space:nowrap;}
.badge.ok{background:rgba(35,134,54,.25);color:#3fb950;border:1px solid #238636;}
.badge.ko{background:rgba(218,54,51,.2);color:#f85149;border:1px solid #da3633;}
.card-body{padding:20px 24px;display:flex;flex-direction:column;gap:20px;}
.section-title{font-weight:700;font-size:13px;color:var(--accent-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;}
.answers-table{width:100%;border-collapse:collapse;}
.answers-table th{text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;padding:6px 10px;border-bottom:1px solid var(--border);}
.answers-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top;}
.answers-table tr:last-child td{border-bottom:none;}
.answers-table .q{color:var(--text-muted);width:55%;font-size:13px;}
.answers-table .a{font-weight:500;}
.answers-table .note{color:var(--star);letter-spacing:2px;}
.num{color:var(--text-muted);font-size:12px;font-weight:400;letter-spacing:0;}
.missing{color:#f85149;font-size:13px;padding:10px 0;}
footer{text-align:center;padding:24px;color:var(--text-muted);font-size:12px;border-top:1px solid var(--border);margin-top:16px;}
</style>
</head>
<body>
<header>
    <h1>📊 Récap Gestion Staff</h1>
    <p>Semaine du ${week} · ${total} membre${total > 1 ? 's' : ''} · Généré le ${new Date().toLocaleString('fr-FR')}</p>
</header>
<div class="summary-bar">
    <div class="summary-stat"><div class="val">${total}</div><div class="lbl">Total</div></div>
    <div class="summary-stat"><div class="val ok">${done}</div><div class="lbl">Tout complété</div></div>
    <div class="summary-stat"><div class="val partial">${partial}</div><div class="lbl">Partiel</div></div>
    <div class="summary-stat"><div class="val ko">${miss}</div><div class="lbl">Rien fait</div></div>
</div>
<div class="container">${cards}</div>
<footer>Gestion Staff — Récap hebdomadaire automatique</footer>
</body>
</html>`;
}

const fs = require('fs');
const FIRED_PATH = './fired.json';

function loadFired() {
    try { return new Set(JSON.parse(fs.readFileSync(FIRED_PATH, 'utf-8'))); }
    catch { return new Set(); }
}

function saveFired(fired) {
    try { fs.writeFileSync(FIRED_PATH, JSON.stringify([...fired]), 'utf-8'); }
    catch (e) { console.error('[WEEKLY] Impossible de sauvegarder fired.json :', e); }
}

function getWeekKey() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
}

function msUntilTime(hour, minute) {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    const diff = target.getTime() - now.getTime();
    return diff > 0 ? diff : 0;
}

function startWeeklyTask(client) {
    const SAT = 6;
    const fired = loadFired();
    const now = new Date();
    const weekKey = getWeekKey();

    // ── AUJOURD'HUI : ping force a 11h30 quoi qu'il arrive ──────────────────
    if (now.getDay() === SAT) {
        const pingKey = `${weekKey}-10`;
        // Supprimer du fired.json au cas ou il aurait ete marque par erreur
        fired.delete(pingKey);
        saveFired(fired);

        const delay = msUntilTime(11, 30);
        console.log(`[WEEKLY] Ping force a 11h30 — dans ${Math.round(delay / 60000)} min`);
        setTimeout(() => {
            console.log('[WEEKLY] Envoi du ping 11h30 !');
            fired.add(pingKey);
            saveFired(fired);
            sendWeeklyPings(client).catch(err => console.error('[WEEKLY] Erreur ping force :', err));
        }, delay);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const tasks = [
        { hour: 10, fn: () => sendWeeklyPings(client)  },
        { hour: 16, fn: () => sendReminderAt16(client) },
        { hour: 17, fn: () => sendRecapAt17(client)    },
        { hour: 18, fn: () => sendRecapAt18(client)    },
    ];

    // Verification toutes les minutes pour les semaines suivantes
    setInterval(() => {
        const now = new Date();
        const weekKey = getWeekKey();

        if (now.getDay() !== SAT) return;

        // Nettoyer les anciennes semaines
        for (const k of fired) {
            const parts = k.split('-');
            if (Number(parts[0]) < weekKey) fired.delete(k);
        }

        for (const task of tasks) {
            const key = `${weekKey}-${task.hour}`;
            if (fired.has(key)) continue;
            if (now.getHours() < task.hour) continue;
            if (now.getHours() === task.hour && now.getMinutes() > 5) continue;

            fired.add(key);
            saveFired(fired);
            console.log(`[WEEKLY] Declenchement tache ${task.hour}h — semaine ${weekKey}`);
            task.fn().catch(err => console.error(`[WEEKLY] Erreur tache ${task.hour}h :`, err));
        }
    }, 60_000);

    console.log('[WEEKLY] Scheduler demarre — ping force a 11h30 aujourd\'hui');
}

module.exports = { startWeeklyTask, getCompletion };
