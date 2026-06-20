require('dotenv').config();
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    EmbedBuilder, AttachmentBuilder, PermissionFlagsBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const axios = require('axios');
const { createCanvas } = require('canvas');
const mongoose = require('mongoose');

const User = require('./models/User');
const Prediction = require('./models/Prediction');
const ServerConfig = require('./models/ServerConfig');
const Character = require('./models/Character');
const UserCharacter = require('./models/UserCharacter');

const WC_BASE = 'https://api.football-data.org/v4';
const WC_HEADERS = { 'X-Auth-Token': process.env.WORLDCUP_API_KEY };
const GUILD_ID = '985019235984109609';

const FLAG_MAP = {
    'Argentina': '🇦🇷', 'Brazil': '🇧🇷', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴',
    'Ecuador': '🇪🇨', 'Chile': '🇨🇱', 'Paraguay': '🇵🇾', 'Venezuela': '🇻🇪',
    'Bolivia': '🇧🇴', 'Peru': '🇵🇪',
    'Germany': '🇩🇪', 'Spain': '🇪🇸', 'Portugal': '🇵🇹', 'France': '🇫🇷',
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Netherlands': '🇳🇱', 'Belgium': '🇧🇪', 'Italy': '🇮🇹',
    'Croatia': '🇭🇷', 'Denmark': '🇩🇰', 'Switzerland': '🇨🇭', 'Turkey': '🇹🇷',
    'Poland': '🇵🇱', 'Serbia': '🇷🇸', 'Austria': '🇦🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'Ukraine': '🇺🇦', 'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿', 'Slovakia': '🇸🇰',
    'Albania': '🇦🇱', 'Hungary': '🇭🇺', 'Georgia': '🇬🇪', 'Slovenia': '🇸🇮',
    'Greece': '🇬🇷', 'Romania': '🇷🇴', 'Norway': '🇳🇴', 'Sweden': '🇸🇪',
    'Finland': '🇫🇮', 'Iceland': '🇮🇸', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Ireland': '🇮🇪',
    'Republic of Ireland': '🇮🇪', 'Luxembourg': '🇱🇺', 'Montenegro': '🇲🇪',
    'North Macedonia': '🇲🇰', 'Kosovo': '🇽🇰', 'Bulgaria': '🇧🇬',
    'United States': '🇺🇸', 'Mexico': '🇲🇽', 'Canada': '🇨🇦', 'Jamaica': '🇯🇲',
    'Panama': '🇵🇦', 'Costa Rica': '🇨🇷', 'Honduras': '🇭🇳', 'El Salvador': '🇸🇻',
    'Trinidad and Tobago': '🇹🇹', 'Suriname': '🇸🇷', 'Haiti': '🇭🇹',
    'Guatemala': '🇬🇹', 'Cuba': '🇨🇺',
    'Morocco': '🇲🇦', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬', 'Senegal': '🇸🇳',
    'Cameroon': '🇨🇲', 'Ghana': '🇬🇭', 'DR Congo': '🇨🇩', 'South Africa': '🇿🇦',
    'Algeria': '🇩🇿', 'Tunisia': '🇹🇳', 'Mali': '🇲🇱', "Côte d'Ivoire": '🇨🇮',
    'Ivory Coast': '🇨🇮', 'Guinea': '🇬🇳', 'Tanzania': '🇹🇿', 'Angola': '🇦🇴',
    'Japan': '🇯🇵', 'Australia': '🇦🇺', 'Korea Republic': '🇰🇷', 'South Korea': '🇰🇷',
    'IR Iran': '🇮🇷', 'Iran': '🇮🇷', 'Saudi Arabia': '🇸🇦', 'Iraq': '🇮🇶',
    'Jordan': '🇯🇴', 'Uzbekistan': '🇺🇿', 'Qatar': '🇶🇦', 'Indonesia': '🇮🇩',
    'Vietnam': '🇻🇳', 'Thailand': '🇹🇭', 'China': '🇨🇳', 'New Zealand': '🇳🇿',
};

function getFlag(name) { return FLAG_MAP[name] ?? ''; }
function teamStr(name) { const f = getFlag(name); return f ? `${f} ${name}` : name; }

// ── Gacha Data ────────────────────────────────────────────────────────────────
let characterCache = [];
const gachaCooldown = new Map();
const rouletteGames = new Map();

function getCharStats(char, uc) {
    const stars = computeStars(uc.count, char.rank);
    const starMult = stars === 3 ? 1.8 : stars === 2 ? 1.35 : 1.0;
    const hp = Math.floor(char.hp_base * (1 + 0.07 * (uc.level - 1)) * starMult);
    const dmg = Math.floor(char.dmg_base * (1 + 0.05 * (uc.level - 1)) * starMult);
    return { stars, hp, dmg };
}

function computeStars(count, rank) {
    if (rank === 'SSS') return count >= 3 ? 3 : count >= 2 ? 2 : 1;
    return count >= 9 ? 3 : count >= 3 ? 2 : 1;
}

function rollRank(pity) {
    const r = Math.random();
    if (r < 0.0005) return 'SSS';
    if (pity >= 499) return 'S';
    if (r < 0.0025) return 'S';
    if (r < 0.0725) return 'A';
    if (r < 0.3005) return 'B';
    return 'C';
}

function doGacha(count, pity) {
    const results = [];
    let p = pity;
    for (let i = 0; i < count; i++) {
        const rank = rollRank(p);
        const pool = characterCache.filter(c => c.rank === rank);
        const char = { ...pool[Math.floor(Math.random() * pool.length)] };
        if (rank === 'S' || rank === 'SSS') char.pityAt = p;
        results.push(char);
        p = (rank === 'S' || rank === 'SSS') ? 0 : p + 1;
    }
    return { results, newPity: p };
}

function buildGachaOutput(results) {
    const RST = '[0m', PUR = '[35m', GLD = '[1;33m', RED = '[1;31m';
    const x10 = results.length === 10;
    const cashResults = results.filter(c => !['S', 'SSS'].includes(c.rank) || c.autoSold);
    const totalCash = cashResults.reduce((s, c) => s + c.value, 0);
    const khoCount = results.filter(c => ['S', 'SSS'].includes(c.rank) && !c.autoSold).length;

    let header;
    if (x10) {
        const parts = [];
        if (totalCash > 0) parts.push(`+**${totalCash.toLocaleString()} hacash**`);
        if (khoCount > 0) parts.push(`**${khoCount} tướng** vào kho`);
        header = `🎰 **Gacha x10** — ${parts.length ? parts.join(' | ') : 'không trúng gì đặc biệt'}`;
    } else {
        header = `🎰 **Gacha x1**`;
    }

    const lines = results.map((c, i) => {
        const pre = x10 ? `${String(i + 1).padStart(2)}. ` : '';
        if (c.rank === 'SSS') return `${pre}🔱 ${RED}${c.name} [SSS]${RST} → ${c.autoSold ? `Bán (+${c.value.toLocaleString()})` : 'Vào kho'}`;
        if (c.rank === 'S')   return `${pre}👑 ${GLD}${c.name} [S]${RST} → ${c.autoSold ? `Bán (+${c.value.toLocaleString()})` : 'Vào kho'}`;
        if (c.rank === 'A')   return `${pre}💜 ${PUR}${c.name} [A]${RST} — ${c.value.toLocaleString()} hacash`;
        return `${pre}${c.name} [${c.rank}] — ${c.value.toLocaleString()} hacash`;
    });

    let out = `${header}\n\`\`\`ansi\n${lines.join('\n')}\n\`\`\``;
    for (const s of results.filter(c => c.rank === 'S'))
        out += `\n🌟 Nổ vàng rồi! 🌟\n**${s.name} [S]** — ${s.autoSold ? 'tự động bán' : 'vào kho đồ'}${s.pityAt != null ? ` _(pity ${s.pityAt + 1})_` : ''}\n✨✨✨✨✨✨✨✨✨✨`;
    for (const s of results.filter(c => c.rank === 'SSS' && !c.autoSold))
        out += `\n🎉 NỔ DÁI RỒI AE ƠI 🎉\n**${s.name} [SSS]** — vào kho đồ\n🎊🎊🎊🎊🎊🎊🎊🎊🎊🎊`;

    const embeds = results
        .filter(c => ['S', 'SSS'].includes(c.rank) && c.image_url)
        .map(c => new EmbedBuilder()
            .setTitle(`${c.rank === 'SSS' ? '🔱' : '👑'} ${c.name} [${c.rank}]`)
            .setThumbnail(c.image_url)
            .setColor(c.rank === 'SSS' ? 0xff4444 : 0xffd700)
        );

    return { content: out, embeds };
}

function createChambers() {
    const c = ['real', 'real', 'blank', 'blank', 'blank', 'blank'];
    for (let i = 5; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
}

function advanceTurn(game) {
    const n = game.players.length;
    for (let i = 1; i <= n; i++) {
        const next = (game.turnIdx + i) % n;
        if (game.players[next].hp > 0) { game.turnIdx = next; return; }
    }
}

function buildRouletteMsg(game) {
    const cur = game.players[game.turnIdx];
    const realLeft = game.chambers.slice(game.chamberIdx).filter(c => c === 'real').length;
    const blankLeft = game.chambers.slice(game.chamberIdx).filter(c => c === 'blank').length;
    const hpStr = game.players.map(p => `${p.username}: ${p.hp >= 2 ? '❤️❤️' : p.hp === 1 ? '❤️🖤' : '💀'}`).join('  ');
    const alive = game.players.filter(p => p.hp > 0);
    const orderStr = alive.map(p => p.id === cur.id ? `**__${p.username}__**` : p.username).join(' → ');
    let txt = `🔫 **CÒ QUAY NGA** | 💰 Tổng cược: **${game.pool.toLocaleString()} hacash**\n\n`;
    txt += `${hpStr}\n\n`;
    txt += `Thứ tự: ${orderStr}\n`;
    txt += `📦 Súng: **${realLeft} có đạn** / **${blankLeft} không đạn** còn lại`;
    if (game.sawedOff) txt += `\n🪚 **Cưa nòng active!**`;
    txt += `\n\n<@${cur.id}> — lượt của bạn!`;
    return txt;
}

function buildRouletteTurnComponents(game) {
    const cid = game.channelId;
    const alive = game.players.filter(p => p.hp > 0);
    const priceKL = Math.floor(game.bet * 0.2);
    const priceCN = Math.floor(game.bet * 0.4);
    const priceRU = Math.floor(game.bet * 0.1);
    const shopRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rl_kl_${cid}`).setLabel(`🔍 Kính lúp ${priceKL.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(game.usedItems.has('kl')),
        new ButtonBuilder().setCustomId(`rl_cn_${cid}`).setLabel(`🪚 Cưa nòng ${priceCN.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(game.usedItems.has('cn') || game.sawedOff),
        new ButtonBuilder().setCustomId(`rl_ru_${cid}`).setLabel(`🍺 Rượu ${priceRU.toLocaleString()}`).setStyle(ButtonStyle.Secondary).setDisabled(game.usedItems.has('ru'))
    );
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rl_self_${cid}`).setLabel('💀 Tự bắn').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rl_other_${cid}`).setLabel('🎯 Bắn người khác').setStyle(ButtonStyle.Primary).setDisabled(alive.length <= 1)
    );
    return [shopRow, actionRow];
}

async function resolveRouletteShot(interaction, game, target, isSelf) {
    const bullet = game.chambers[game.chamberIdx];
    game.chamberIdx++;
    const needReload = game.chamberIdx >= game.chambers.length;
    if (needReload) { game.chambers = createChambers(); game.chamberIdx = 0; }

    const damage = game.sawedOff ? 2 : 1;
    game.sawedOff = false;
    game.usedItems = new Set();

    if (bullet === 'blank') {
        if (isSelf) {
            // Keep turn
            const msg = `⚪ **Không đạn!** ${target.username} tự bắn — **giữ lượt!**`;
            if (needReload) await interaction.channel.send('🔄 Súng hết! Nạp lại: **2 có đạn / 4 không đạn**');
            return interaction.update({ content: `${msg}\n\n${buildRouletteMsg(game)}`, components: buildRouletteTurnComponents(game) });
        } else {
            const shooterName = game.players[game.turnIdx].username;
            advanceTurn(game);
            const msg = `⚪ **Không đạn!** ${shooterName} bắn ${target.username} — chuyển lượt.`;
            if (needReload) await interaction.channel.send('🔄 Súng hết! Nạp lại: **2 có đạn / 4 không đạn**');
            return interaction.update({ content: `${msg}\n\n${buildRouletteMsg(game)}`, components: buildRouletteTurnComponents(game) });
        }
    }

    // Bullet hit
    const shooter = game.players[game.turnIdx];
    target.hp = Math.max(0, target.hp - damage);
    const dmgStr = damage > 1 ? ' 💥 **CƯA NÒNG x2!**' : '';
    const deadStr = target.hp <= 0 ? ' ☠️ **LOẠI!**' : '';
    const hitMsg = `🔴 **CÓ ĐẠN!** ${isSelf ? `${shooter.username} tự bắn` : `${shooter.username} bắn ${target.username}`}${dmgStr} → -${damage} HP${deadStr}`;

    const stillAlive = game.players.filter(p => p.hp > 0);
    if (stillAlive.length <= 1) {
        const winner = stillAlive[0] ?? shooter;
        await User.updateOne({ discordId: winner.id, guildId: game.guildId }, { $inc: { hacash: game.pool } });
        rouletteGames.delete(game.channelId);
        return interaction.update({ content: `${hitMsg}\n\n🏆 **${winner.username} THẮNG!** +**${game.pool.toLocaleString()} hacash**`, components: [] });
    }

    advanceTurn(game);
    if (needReload) await interaction.channel.send('🔄 Súng hết! Nạp lại: **2 có đạn / 4 không đạn**');
    return interaction.update({ content: `${hitMsg}\n\n${buildRouletteMsg(game)}`, components: buildRouletteTurnComponents(game) });
}

async function loadTeam(userId, guildId) {
    const user = await User.findOne({ discordId: userId, guildId });
    if (!user?.defenseTeam?.length) return [];
    const fighters = [];
    for (const charId of user.defenseTeam) {
        const char = characterCache.find(c => c._id.toString() === charId.toString());
        if (!char) continue;
        const uc = await UserCharacter.findOne({ userId, guildId, characterId: char._id });
        if (!uc) continue;
        const { stars, hp, dmg } = getCharStats(char, uc);
        fighters.push({ name: char.name, rank: char.rank, role: char.role, maxHp: hp, hp, dmg, image_url: char.image_url ?? null });
    }
    return fighters;
}

function runCombat(teamA, teamB, alarmTriggered) {
    const a = teamA.map(c => ({ ...c }));
    let b = teamB.map(c => ({ ...c }));
    const logs = [];

    if (alarmTriggered) {
        b = b.map(c => ({ ...c, hp: Math.floor(c.hp * 1.2), maxHp: Math.floor(c.maxHp * 1.2), dmg: Math.floor(c.dmg * 1.2) }));
        logs.push('🚨 **Báo Động Đỏ!** Team thủ +20% HP & DMG\n');
    }

    const alive = arr => arr.filter(c => c.hp > 0);
    const totalHp = arr => arr.reduce((s, c) => s + c.hp, 0);
    let aFirst = totalHp(a) <= totalHp(b);

    for (let turn = 1; turn <= 20 && alive(a).length && alive(b).length; turn++) {
        const atk = aFirst ? a : b;
        const def = aFirst ? b : a;
        const lines = [`**Turn ${turn}** ${aFirst ? '🔵' : '🔴'}`];

        for (const c of alive(atk)) {
            const targets = alive(def);
            if (!targets.length) break;
            const t = targets[Math.floor(Math.random() * targets.length)];
            const crit = Math.random() < 0.2;
            const dmg = Math.floor(c.dmg * (crit ? 1.5 : 1));
            t.hp = Math.max(0, t.hp - dmg);
            lines.push(`• ${c.name} → ${t.name}: **-${dmg.toLocaleString()}**${crit ? ' ⚡' : ''}${t.hp <= 0 ? ' ☠️' : ''}`);
        }

        lines.push(`🔵 ${a.map(c => `${c.name} ${c.hp > 0 ? c.hp.toLocaleString() : '☠️'}`).join(' | ')}`);
        lines.push(`🔴 ${b.map(c => `${c.name} ${c.hp > 0 ? c.hp.toLocaleString() : '☠️'}`).join(' | ')}`);
        logs.push(lines.join('\n'));
        aFirst = !aFirst;
    }

    const aWon = alive(b).length === 0;
    return { logs, aWon };
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ── Commands ──────────────────────────────────────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Tra cứu dữ liệu TFT')
        .addStringOption(opt =>
            opt.setName('player').setDescription('Tên in-game (VD: Namblee#Mar30)').setRequired(true)
        ),
    new SlashCommandBuilder().setName('help').setDescription('Hướng dẫn sử dụng bot'),
    new SlashCommandBuilder().setName('daily').setDescription('Nhận 1,000–10,000 hacash mỗi ngày'),
    new SlashCommandBuilder().setName('balance').setDescription('Xem số dư hacash của bạn'),
    new SlashCommandBuilder().setName('matches').setDescription('Xem trận đang diễn ra và 5 trận tiếp theo'),
    new SlashCommandBuilder().setName('betwin').setDescription('Cược đội thắng/hòa — đúng x3, sai mất cược'),
    new SlashCommandBuilder().setName('bettiso').setDescription('Cược tỉ số — đúng x10, lệch 1 hiệu số +50%'),
    new SlashCommandBuilder().setName('mybet').setDescription('Xem các cược đang chờ kết quả'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Bảng xếp hạng Hacash top 10'),
    new SlashCommandBuilder().setName('lucchien').setDescription('Bảng xếp hạng lực chiến đội hình top 10'),
    new SlashCommandBuilder().setName('inventory').setDescription('Xem kho tướng S/SSS của bạn'),
    new SlashCommandBuilder()
        .setName('levelup')
        .setDescription('Tăng level tướng S/SSS (max level 50)')
        .addStringOption(opt =>
            opt.setName('ten').setDescription('Tên tướng').setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption(opt =>
            opt.setName('soluong').setDescription('Số cấp muốn nâng (mặc định 1)').setRequired(false).setMinValue(1).setMaxValue(49)
        ),
    new SlashCommandBuilder()
        .setName('team')
        .setDescription('Quản lý đội hình chiến đấu')
        .addSubcommand(sub => sub.setName('view').setDescription('Xem đội hình hiện tại'))
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Đặt đội hình (1-3 tướng S/SSS)')
            .addStringOption(opt => opt.setName('tuong1').setDescription('Tướng 1').setRequired(true).setAutocomplete(true))
            .addStringOption(opt => opt.setName('tuong2').setDescription('Tướng 2').setRequired(false).setAutocomplete(true))
            .addStringOption(opt => opt.setName('tuong3').setDescription('Tướng 3').setRequired(false).setAutocomplete(true))
        ),
    new SlashCommandBuilder()
        .setName('heist')
        .setDescription('Cướp hacash của người khác — cần có đội hình')
        .addUserOption(opt =>
            opt.setName('user').setDescription('Người bị tấn công').setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Tạo phòng Cò Quay Nga (2-6 người)')
        .addIntegerOption(opt =>
            opt.setName('cuoc').setDescription('Số hacash cược mỗi người').setRequired(true).setMinValue(100)
        ),
    new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Quay gacha — x1 (500 hacash) hoặc x10 (5,000 hacash)')
        .addIntegerOption(opt =>
            opt.setName('amount').setDescription('Số lần quay').setRequired(false)
                .addChoices({ name: 'x1 — 500 hacash', value: 1 }, { name: 'x10 — 5,000 hacash', value: 10 })
        ),
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('Đặt channel nhận thông báo trận đấu (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('Đổi prefix lệnh chat cho server (Admin)')
        .addStringOption(opt =>
            opt.setName('prefix').setDescription('Prefix mới, VD: ha').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
        .setName('setalias')
        .setDescription('Đặt tên rút gọn cho lệnh chat (Admin)')
        .addStringOption(opt =>
            opt.setName('command').setDescription('Lệnh gốc').setRequired(true)
                .addChoices(
                    { name: 'daily', value: 'daily' },
                    { name: 'balance', value: 'balance' },
                    { name: 'matches', value: 'matches' },
                    { name: 'mybet', value: 'mybet' },
                    { name: 'leaderboard', value: 'leaderboard' },
                    { name: 'latxu', value: 'latxu' },
                    { name: 'gacha', value: 'gacha' },
                    { name: 'send', value: 'send' }
                )
        )
        .addStringOption(opt =>
            opt.setName('alias').setDescription('Tên rút gọn, VD: lx').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(cmd => cmd.toJSON());

// ── TFT ───────────────────────────────────────────────────────────────────────
function getRankColor(tier) {
    if (!tier) return '#2b2d31';
    switch (tier.toUpperCase()) {
        case 'IRON': return '#595959'; case 'BRONZE': return '#965a38';
        case 'SILVER': return '#a6a6a6'; case 'GOLD': return '#ffd700';
        case 'PLATINUM': return '#78b5b1'; case 'EMERALD': return '#2ecc71';
        case 'DIAMOND': return '#5b5af5'; case 'MASTER': return '#b83cb8';
        case 'GRANDMASTER': return '#ff3333'; case 'CHALLENGER': return '#00ffff';
        default: return '#2b2d31';
    }
}

async function createHistoryImage(historyArray) {
    const canvas = createCanvas(500, 60);
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const spacing = 500 / historyArray.length;
    historyArray.forEach((top, i) => {
        const x = i * spacing + spacing / 2;
        if (top === 1) ctx.fillStyle = '#b83cb8';
        else if (top === 2) ctx.fillStyle = '#5b5af5';
        else if (top === 3) ctx.fillStyle = '#2ecc71';
        else if (top === 4) ctx.fillStyle = '#ffd700';
        else ctx.fillStyle = '#7a7a7a';
        ctx.fillText(top.toString(), x, 30);
    });
    return new AttachmentBuilder(canvas.toBuffer(), { name: 'history-image.png' });
}

async function fetchTFTData(gameName, tagLine) {
    const headers = { 'X-Riot-Token': process.env.RIOT_API_KEY };
    try {
        const { data: account } = await axios.get(
            `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
            { headers }
        );
        const { data: summoner } = await axios.get(
            `https://vn2.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${account.puuid}`, { headers }
        );
        const thumbnailUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${summoner.profileIconId}.jpg`;

        let rankString = 'Unranked', totalGames = 0, top4Rate = 0, embedColor = '#2b2d31';
        try {
            const { data: rankData } = await axios.get(
                `https://vn2.api.riotgames.com/tft/league/v1/by-puuid/${account.puuid}`, { headers }
            );
            if (rankData?.length > 0) {
                const r = rankData[0];
                rankString = `${r.tier} ${r.rank} (${r.leaguePoints} LP)`;
                totalGames = r.wins + r.losses;
                top4Rate = totalGames > 0 ? ((r.wins / totalGames) * 100).toFixed(1) : 0;
                embedColor = getRankColor(r.tier);
            }
        } catch (e) {}

        const { data: matchIds } = await axios.get(
            `https://sea.api.riotgames.com/tft/match/v1/matches/by-puuid/${account.puuid}/ids?count=10`, { headers }
        );
        const matchResults = await Promise.all(
            matchIds.map(id => axios.get(`https://sea.api.riotgames.com/tft/match/v1/matches/${id}`, { headers }))
        );
        const history = matchResults
            .map(r => r.data.info.participants.find(p => p.puuid === account.puuid))
            .filter(Boolean).map(p => p.placement);

        return { success: true, rank: rankString, thumbnailUrl, totalGames, top4Rate, rawHistory: history, embedColor };
    } catch { return { success: false }; }
}

// ── World Cup Helpers ─────────────────────────────────────────────────────────
function toVNTime(date) {
    return new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000);
}
function formatVNTime(utcDate) {
    const d = toVNTime(utcDate);
    return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

async function getOrCreateUser(discordId, guildId, username) {
    const user = await User.findOneAndUpdate(
        { discordId, guildId },
        { $setOnInsert: { hacash: 0, lastDaily: null }, $set: { username } },
        { upsert: true, new: true }
    );
    return user;
}

async function fetchUpcomingMatches(limit = 5) {
    const res = await axios.get(`${WC_BASE}/competitions/WC/matches`, {
        headers: WC_HEADERS, params: { status: 'SCHEDULED,TIMED' }
    });
    return res.data.matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)).slice(0, limit);
}

async function fetchLiveMatches() {
    const res = await axios.get(`${WC_BASE}/competitions/WC/matches`, {
        headers: WC_HEADERS, params: { status: 'IN_PLAY,PAUSED' }
    });
    return res.data.matches;
}

function buildMatchSelectMenu(matches, type, userId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${type}_select_${userId}`)
            .setPlaceholder('Chọn trận đấu...')
            .addOptions(matches.map(m => ({
                label: `${m.homeTeam.name} vs ${m.awayTeam.name}`.slice(0, 100),
                description: `${formatVNTime(m.utcDate)} ICT`,
                value: `${m.id}|${m.homeTeam.name.slice(0, 25)}|${m.awayTeam.name.slice(0, 25)}`
            })))
    );
}

// ── Settle ────────────────────────────────────────────────────────────────────
async function settlePredictions() {
    const pending = await Prediction.find({ status: 'pending' });
    if (!pending.length) return;

    for (const matchId of [...new Set(pending.map(p => p.matchId))]) {
        try {
            const { data: match } = await axios.get(`${WC_BASE}/matches/${matchId}`, { headers: WC_HEADERS });
            if (match.status !== 'FINISHED') continue;

            const aH = match.score.fullTime.home, aA = match.score.fullTime.away;
            const actualDiff = aH - aA;

            for (const pred of pending.filter(p => p.matchId === matchId)) {
                let payout = 0, status = 'lost';

                if (pred.type === 'winner') {
                    if (pred.predictedWinner === match.score.winner) { payout = pred.betAmount * 3; status = 'won'; }
                } else {
                    if (pred.predictedHome === aH && pred.predictedAway === aA) {
                        payout = pred.betAmount * 10; status = 'won';
                    } else if (Math.abs((pred.predictedHome - pred.predictedAway) - actualDiff) === 1) {
                        payout = Math.floor(pred.betAmount * 1.5); status = 'partial';
                    }
                }

                if (payout > 0) await User.updateOne({ discordId: pred.discordId, guildId: pred.guildId }, { $inc: { hacash: payout } });

                try {
                    const u = await client.users.fetch(pred.discordId);
                    const emoji = { won: '🏆', partial: '🥈', lost: '❌' }[status];
                    const predStr = pred.type === 'winner'
                        ? (pred.predictedWinner === 'HOME_TEAM' ? teamStr(pred.homeTeam) : pred.predictedWinner === 'AWAY_TEAM' ? teamStr(pred.awayTeam) : '🤝 Hòa')
                        : `${pred.predictedHome} - ${pred.predictedAway}`;
                    const resultStr = payout > 0 ? `+${payout.toLocaleString()} hacash` : `-${pred.betAmount.toLocaleString()} hacash`;
                    await u.send([
                        `${emoji} **${teamStr(pred.homeTeam)} vs ${teamStr(pred.awayTeam)}**`,
                        `Tỉ số thực: **${aH} - ${aA}**  |  Cược: ${predStr}`,
                        `Kết quả: **${resultStr}**`
                    ].join('\n'));
                } catch (e) {}

                await Prediction.deleteOne({ _id: pred._id });
            }
        } catch (err) {
            if (err.response?.status !== 404) console.error(`Settle error match ${matchId}:`, err.message);
        }
    }
}

// ── Reminders ─────────────────────────────────────────────────────────────────
const remindedMatches = new Set();

async function checkMatchReminders() {
    try {
        const configs = await ServerConfig.find({ announcementChannelId: { $ne: null } });
        if (!configs.length) return;

        const now = new Date();
        const upcoming = await fetchUpcomingMatches(20);

        for (const match of upcoming) {
            const diff = (new Date(match.utcDate) - now) / 60000;
            if (diff < 115 || diff > 125 || remindedMatches.has(match.id)) continue;
            remindedMatches.add(match.id);

            const msg = [
                `⚽ **Trận đấu bắt đầu sau 2 tiếng!**`,
                `${teamStr(match.homeTeam.name)} vs ${teamStr(match.awayTeam.name)}`,
                `🕐 ${formatVNTime(match.utcDate)} ICT`,
                `Dùng **/betwin** hoặc **/bettiso** để cược!`
            ].join('\n');

            for (const config of configs) {
                const channel = client.channels.cache.get(config.announcementChannelId);
                if (channel) await channel.send(msg).catch(() => {});
            }
        }
    } catch (err) { console.error('Reminder error:', err.message); }
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ Nambot is online as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: [] });
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commands registered');
    } catch (err) { console.error(err); }

    characterCache = await Character.find().lean();
    console.log(`✅ Loaded ${characterCache.length} characters`);

    setInterval(settlePredictions, 5 * 60 * 1000);
    setInterval(checkMatchReminders, 5 * 60 * 1000);
});

// ── Interactions ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

    // ── Autocomplete ───────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'levelup' || commandName === 'team') {
            const focused = interaction.options.getFocused().toLowerCase();
            const ownedList = await UserCharacter.find({ userId: interaction.user.id, guildId: interaction.guildId }).lean();
            const choices = ownedList
                .map(uc => characterCache.find(c => c._id.toString() === uc.characterId.toString())?.name)
                .filter(Boolean)
                .filter(name => name.toLowerCase().includes(focused))
                .slice(0, 25);
            return interaction.respond(choices.map(name => ({ name, value: name })));
        }
        return;
    }

    // ── Slash Commands ─────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // /stats
        if (commandName === 'stats') {
            await interaction.deferReply();
            const playerInput = interaction.options.getString('player');
            const hashIndex = playerInput.indexOf('#');
            const [gameName, tagLine] = hashIndex !== -1
                ? [playerInput.slice(0, hashIndex), playerInput.slice(hashIndex + 1)]
                : [playerInput, undefined];
            if (!gameName || !tagLine) return interaction.editReply('Sai format. VD: Namblee#Mar30');

            const data = await fetchTFTData(gameName, tagLine);
            if (!data.success) return interaction.editReply(`Không tìm thấy dữ liệu cho **${playerInput}**.`);

            const file = await createHistoryImage(data.rawHistory);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(data.embedColor)
                    .setTitle(`Account: ${gameName}`)
                    .setDescription(`Tagline: #${tagLine}`)
                    .setThumbnail(data.thumbnailUrl)
                    .addFields(
                        { name: 'Rank', value: `**${data.rank}**`, inline: false },
                        { name: 'Total games', value: `${data.totalGames}`, inline: true },
                        { name: '% Top 4', value: `${data.top4Rate}%`, inline: true },
                        { name: 'LSĐ (10 game):', value: '​', inline: false }
                    )
                    .setImage('attachment://history-image.png')
                    .setFooter({ text: 'Riot API' }).setTimestamp()],
                files: [file]
            });
        }

        // /help
        if (commandName === 'help') {
            const cfg = await ServerConfig.findOne({ guildId: interaction.guildId });
            const p = cfg?.prefix ?? 'hacash';

            const lines = [
                `**💰 Kiếm tiền**`,
                `\`/daily\` : nhận 1,000–10,000 hacash mỗi ngày`,
                `\`/balance\` : xem số dư hacash`,
                `\`${p} send @người <số>\` : chuyển hacash (giới hạn 200k/ngày)`,
                `\`${p} latxu [s] <số | all>\` : lật xu ăn x1, max 500k`,
                ``,
                `**🎰 Gacha**`,
                `\`/gacha\` · \`${p} gacha [10]\` : quay gacha 500/lần`,
                `\`/inventory\` : xem kho tướng S/SSS`,
                `\`/levelup <tên>\` : tăng level tướng (max 50)`,
                ``,
                `**⚔️ Chiến đấu**`,
                `\`/team set\` : đặt đội hình 1–3 tướng S/SSS`,
                `\`/team view\` : xem đội hình & chỉ số`,
                `\`/heist @người\` : cướp 15–50% két tiền (cooldown 3h/6h)`,
                ``,
                `**🔫 Mini-game**`,
                `\`/roulette <cược>\` : Cò Quay Nga 2–6 người`,
                `　🔍 Kính lúp (20% cược) — xem viên tiếp theo (chỉ bạn thấy)`,
                `　🪚 Cưa nòng (40% cược) — viên tiếp theo gây 2 lần sát thương`,
                `　🍺 Rượu (10% cược) — eject viên hiện tại, chuyển lượt`,
                ``,
                `**🏆 World Cup**`,
                `\`/matches\` : trận đang diễn ra & sắp tới`,
                `\`/betwin\` : cược đội thắng/hòa (x3)`,
                `\`/bettiso\` : cược tỉ số chính xác (x10)`,
                `\`/mybet\` : xem cược đang chờ kết quả`,
                `\`/leaderboard\` : bảng xếp hạng hacash server`,
                ``,
                `**⚙️ Admin**`,
                `\`/setchannel\` · \`/setprefix\` · \`/setalias\``,
            ];

            return interaction.reply(`**Các lệnh hiện có:**\n\n${lines.join('\n')}`);
        }

        // /daily
        if (commandName === 'daily') {
            await interaction.deferReply();
            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            const nowVN = toVNTime(new Date());
            const todayStr = nowVN.toISOString().slice(0, 10);

            if (user.lastDaily && toVNTime(user.lastDaily).toISOString().slice(0, 10) === todayStr) {
                const next = new Date(nowVN);
                next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0);
                return interaction.editReply(`**${interaction.user.username}** đã nhận daily rồi! Quay lại sau **${Math.ceil((next - nowVN) / 3600000)} tiếng** nữa nhé.`);
            }

            const reward = Math.floor(Math.random() * 9001) + 1000;
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: reward }, lastDaily: new Date() });
            return interaction.editReply(`Chào ngày mới **${interaction.user.username}** gay, đây là lương ngày của bạn: **${reward.toLocaleString()}** 💵`);
        }

        // /balance
        if (commandName === 'balance') {
            await interaction.deferReply();
            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            const pending = await Prediction.find({ discordId: interaction.user.id, guildId: interaction.guildId });
            const inPlay = pending.reduce((s, p) => s + p.betAmount, 0);
            return interaction.editReply([
                `💼 **${interaction.user.username}**`,
                `Số dư: **${user.hacash.toLocaleString()} hacash**`,
                `Đang cược: ${inPlay.toLocaleString()} hacash (${pending.length} cược)`
            ].join('\n'));
        }

        // /matches
        if (commandName === 'matches') {
            await interaction.deferReply();
            try {
                const [live, upcoming] = await Promise.all([fetchLiveMatches(), fetchUpcomingMatches(5)]);
                const lines = [];

                if (live.length) {
                    lines.push('**🔴 Đang diễn ra**');
                    live.forEach(m => {
                        const h = m.score?.fullTime?.home, a = m.score?.fullTime?.away;
                        const score = h != null ? `**${h} - ${a}**` : '⏳';
                        const suffix = m.status === 'PAUSED' ? ' _(Nghỉ giữa hiệp)_' : '';
                        lines.push(`${teamStr(m.homeTeam.name)} ${score} ${teamStr(m.awayTeam.name)}${suffix}`);
                    });
                    lines.push('');
                }

                lines.push('**📅 5 Trận tiếp theo**');
                if (upcoming.length) {
                    upcoming.forEach(m =>
                        lines.push(`${formatVNTime(m.utcDate)} ICT — ${teamStr(m.homeTeam.name)} vs ${teamStr(m.awayTeam.name)}`)
                    );
                } else {
                    lines.push('_Không có trận nào sắp diễn ra._');
                }

                return interaction.editReply(lines.join('\n'));
            } catch (err) {
                console.error('Matches error:', err.message);
                return interaction.editReply('Lỗi khi lấy dữ liệu. Thử lại sau nhé.');
            }
        }

        // /betwin
        if (commandName === 'betwin') {
            await interaction.deferReply();
            try {
                const matches = await fetchUpcomingMatches(5);
                if (!matches.length) return interaction.editReply('Không có trận nào sắp diễn ra để cược.');
                return interaction.editReply({
                    content: '**🏆 Cược đội thắng** — Chọn trận:\n_Đúng x3 | Sai mất cược_',
                    components: [buildMatchSelectMenu(matches, 'bw', interaction.user.id)]
                });
            } catch { return interaction.editReply('Lỗi khi lấy dữ liệu. Thử lại sau nhé.'); }
        }

        // /bettiso
        if (commandName === 'bettiso') {
            await interaction.deferReply();
            try {
                const matches = await fetchUpcomingMatches(5);
                if (!matches.length) return interaction.editReply('Không có trận nào sắp diễn ra để cược.');
                return interaction.editReply({
                    content: '**🎯 Cược tỉ số** — Chọn trận:\n_Đúng x10 | Lệch 1 hiệu số +50% | Còn lại mất cược_',
                    components: [buildMatchSelectMenu(matches, 'bs', interaction.user.id)]
                });
            } catch { return interaction.editReply('Lỗi khi lấy dữ liệu. Thử lại sau nhé.'); }
        }

        // /mybet
        if (commandName === 'mybet') {
            await interaction.deferReply();
            const preds = await Prediction.find({ discordId: interaction.user.id, guildId: interaction.guildId }).sort({ createdAt: -1 });
            if (!preds.length) return interaction.editReply('Bạn không có cược nào đang chờ kết quả.');

            const lines = [`📋 **Cược của ${interaction.user.username}**`, ''];
            preds.forEach(p => {
                const predStr = p.type === 'winner'
                    ? (p.predictedWinner === 'HOME_TEAM' ? teamStr(p.homeTeam) : p.predictedWinner === 'AWAY_TEAM' ? teamStr(p.awayTeam) : '🤝 Hòa')
                    : `${p.predictedHome} - ${p.predictedAway}`;
                lines.push(`⏳ ${teamStr(p.homeTeam)} vs ${teamStr(p.awayTeam)} — ${predStr} — **${p.betAmount.toLocaleString()} hacash**`);
            });

            return interaction.editReply(lines.join('\n'));
        }

        // /leaderboard
        if (commandName === 'leaderboard') {
            await interaction.deferReply();
            const top = await User.find({ guildId: interaction.guildId }).sort({ hacash: -1 }).limit(10);
            if (!top.length) return interaction.editReply('Chưa có ai trong bảng xếp hạng.');

            const lines = top.map((u, i) => `${i + 1}. ${u.username ?? 'Unknown'} - ${u.hacash.toLocaleString()} hacash`);
            return interaction.editReply(`# Bảng xếp hạng Hacash\nServer: ${interaction.guild.name}\n\n${lines.join('\n')}`);
        }

        if (commandName === 'lucchien') {
            await interaction.deferReply();
            const users = await User.find({ guildId: interaction.guildId, 'defenseTeam.0': { $exists: true } }).lean();
            const entries = [];
            for (const u of users) {
                const team = await loadTeam(u.discordId, interaction.guildId);
                if (!team.length) continue;
                const cp = team.reduce((t, f) => t + f.hp + f.dmg * 4, 0);
                entries.push({ username: u.username ?? 'Unknown', cp, teamNames: team.map(f => f.name).join(', ') });
            }
            if (!entries.length) return interaction.editReply('Chưa có ai đặt đội hình.');
            entries.sort((a, b) => b.cp - a.cp);
            const lines = entries.slice(0, 10).map((e, i) =>
                `${i + 1}. **${e.username}** — ⚔️ **${e.cp.toLocaleString()} CP** _(${e.teamNames})_`
            );
            return interaction.editReply(`# ⚔️ Bảng xếp hạng Lực Chiến\nServer: ${interaction.guild.name}\n\n${lines.join('\n')}`);
        }

        // /gacha
        if (commandName === 'gacha') {
            const now = Date.now();
            const last = gachaCooldown.get(interaction.user.id) ?? 0;
            if (now - last < 7000)
                return interaction.reply({ content: `Chờ **${((7000 - (now - last)) / 1000).toFixed(1)}s** nữa nhé!`, ephemeral: true });
            gachaCooldown.set(interaction.user.id, now);
            await interaction.deferReply();

            const count = interaction.options.getInteger('amount') ?? 1;
            const cost = count * 500;
            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);

            if (user.hacash < cost)
                return interaction.editReply(`Không đủ hacash! Cần **${cost.toLocaleString()}**, bạn có **${user.hacash.toLocaleString()}**.`);

            const { results, newPity } = doGacha(count, user.gachaPity ?? 0);
            const cashEarned = results.filter(c => !['S', 'SSS'].includes(c.rank)).reduce((s, c) => s + c.value, 0);
            const net = cashEarned - cost;

            await User.updateOne(
                { discordId: interaction.user.id, guildId: interaction.guildId },
                { $inc: { hacash: net }, $set: { gachaPity: newPity } }
            );

            let autoSellTotal = 0;
            for (const char of results.filter(c => ['S', 'SSS'].includes(c.rank))) {
                const threshold = char.rank === 'SSS' ? 3 : 9;
                const updated = await UserCharacter.findOneAndUpdate(
                    { userId: interaction.user.id, guildId: interaction.guildId, characterId: char._id },
                    { $inc: { count: 1 } },
                    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
                );
                if (updated.count > threshold) { char.autoSold = true; autoSellTotal += char.value; }
            }
            if (autoSellTotal > 0)
                await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: autoSellTotal } });

            return interaction.editReply(buildGachaOutput(results));
        }

        // /inventory
        if (commandName === 'inventory') {
            await interaction.deferReply();
            const ownedList = await UserCharacter.find({ userId: interaction.user.id, guildId: interaction.guildId }).lean();
            if (!ownedList.length)
                return interaction.editReply('Kho đồ trống! Chưa có tướng S/SSS nào.');

            const invEmbeds = [];
            for (const uc of ownedList) {
                const char = characterCache.find(c => c._id.toString() === uc.characterId.toString());
                if (!char) continue;
                const { stars, hp, dmg } = getCharStats(char, uc);
                const rankEmoji = char.rank === 'SSS' ? '🔱' : '👑';
                const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
                const desc = `${uc.count} bản | ❤️ ${hp.toLocaleString()} | ⚔️ ${dmg.toLocaleString()}`;
                const embed = new EmbedBuilder()
                    .setTitle(`${rankEmoji} ${char.name} [${char.rank}] ${starStr} Lv.${uc.level}`)
                    .setDescription(desc)
                    .setColor(char.rank === 'SSS' ? 0xff4444 : 0xffd700);
                if (char.image_url) embed.setThumbnail(char.image_url);
                invEmbeds.push(embed);
            }

            return interaction.editReply({ content: `🎒 **Kho đồ của ${interaction.user.username}**`, embeds: invEmbeds });
        }

        // /levelup
        if (commandName === 'levelup') {
            await interaction.deferReply();
            const tenTuong = interaction.options.getString('ten');
            const wantLevels = interaction.options.getInteger('soluong');
            const char = characterCache.find(c =>
                ['S', 'SSS'].includes(c.rank) && c.name.toLowerCase() === tenTuong.toLowerCase()
            );
            if (!char)
                return interaction.editReply(`Không tìm thấy tướng **${tenTuong}**. Chỉ có thể level-up tướng S hoặc SSS.`);

            const uc = await UserCharacter.findOne({ userId: interaction.user.id, guildId: interaction.guildId, characterId: char._id });
            if (!uc)
                return interaction.editReply(`Bạn chưa có **${char.name}** trong kho.`);
            if (uc.level >= 50)
                return interaction.editReply(`**${char.name}** đã đạt level tối đa (50)!`);

            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);

            if (wantLevels === null) {
                const milestones = [1, 3, 5, 10, 20];
                const maxAvail = 50 - uc.level;
                const lines = [`💡 **${char.name}** [${char.rank}] — Lv.**${uc.level}** | 💰 ${user.hacash.toLocaleString()} hacash\n`];
                lines.push('Số cấp | Chi phí | Level sau');
                lines.push('───────┼─────────┼──────────');
                for (const n of milestones) {
                    if (n > maxAvail) break;
                    let cost = 0;
                    for (let i = 0; i < n; i++) cost += Math.floor(500 * Math.pow(uc.level + i, 1.4));
                    const affordable = user.hacash >= cost ? '✅' : '❌';
                    lines.push(`+${String(n).padEnd(6)}| ${cost.toLocaleString().padEnd(10)}| Lv.${uc.level + n} ${affordable}`);
                }
                lines.push(`\nDùng \`/levelup ten:${char.name} soluong:<số>\` để nâng.`);
                return interaction.editReply('```\n' + lines.join('\n') + '\n```');
            }

            const actualLevels = Math.min(wantLevels, 50 - uc.level);
            let totalCost = 0;
            for (let i = 0; i < actualLevels; i++)
                totalCost += Math.floor(500 * Math.pow(uc.level + i, 1.4));

            if (user.hacash < totalCost)
                return interaction.editReply(`Không đủ hacash! Cần **${totalCost.toLocaleString()}** cho ${actualLevels} cấp, bạn có **${user.hacash.toLocaleString()}**.`);

            const before = getCharStats(char, uc);
            const ucAfter = { ...uc.toObject(), level: uc.level + actualLevels };
            const after = getCharStats(char, ucAfter);

            await UserCharacter.updateOne({ _id: uc._id }, { $inc: { level: actualLevels } });
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -totalCost } });

            const starStr = '★'.repeat(before.stars) + '☆'.repeat(3 - before.stars);
            const capNote = actualLevels < wantLevels ? ` _(giới hạn level 50)_` : '';
            return interaction.editReply(
                `⬆️ **${char.name}** [${char.rank}] ${starStr} — Lv.${uc.level} → Lv.${uc.level + actualLevels}${capNote}\n` +
                `❤️ HP: ${before.hp.toLocaleString()} → **${after.hp.toLocaleString()}**\n` +
                `⚔️ DMG: ${before.dmg.toLocaleString()} → **${after.dmg.toLocaleString()}**\n` +
                `-${totalCost.toLocaleString()} hacash | Còn: **${(user.hacash - totalCost).toLocaleString()}**`
            );
        }

        // /team
        if (commandName === 'team') {
            await interaction.deferReply();
            const sub = interaction.options.getSubcommand();

            if (sub === 'set') {
                const names = [
                    interaction.options.getString('tuong1'),
                    interaction.options.getString('tuong2'),
                    interaction.options.getString('tuong3')
                ].filter(Boolean);

                const charIds = [];
                for (const name of names) {
                    const char = characterCache.find(c =>
                        ['S', 'SSS'].includes(c.rank) && c.name.toLowerCase() === name.toLowerCase()
                    );
                    if (!char)
                        return interaction.editReply(`Không tìm thấy tướng **${name}**. Chỉ dùng tướng S hoặc SSS.`);
                    const uc = await UserCharacter.findOne({ userId: interaction.user.id, guildId: interaction.guildId, characterId: char._id });
                    if (!uc)
                        return interaction.editReply(`Bạn chưa có **${char.name}** trong kho.`);
                    if (charIds.some(id => id.toString() === char._id.toString()))
                        return interaction.editReply(`**${char.name}** bị trùng trong đội hình.`);
                    charIds.push(char._id);
                }

                await User.updateOne(
                    { discordId: interaction.user.id, guildId: interaction.guildId },
                    { $set: { defenseTeam: charIds } }
                );
                return interaction.editReply(`✅ Đã cập nhật đội hình: **${names.join(', ')}**`);
            }

            if (sub === 'view') {
                const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
                if (!user.defenseTeam?.length)
                    return interaction.editReply('Chưa có đội hình. Dùng `/team set` để đặt.');

                const lines = [];
                for (const charId of user.defenseTeam) {
                    const char = characterCache.find(c => c._id.toString() === charId.toString());
                    if (!char) continue;
                    const uc = await UserCharacter.findOne({ userId: interaction.user.id, guildId: interaction.guildId, characterId: char._id });
                    if (!uc) continue;
                    const { stars, hp, dmg } = getCharStats(char, uc);
                    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
                    const roleIcon = char.role === 'tank' ? '🛡️' : '⚔️';
                    lines.push(`${roleIcon} **${char.name}** [${char.rank}] ${starStr} Lv.${uc.level} — ❤️ ${hp.toLocaleString()} | ⚔️ ${dmg.toLocaleString()}`);
                }

                return interaction.editReply(`🏆 **Đội hình của ${interaction.user.username}**\n\n${lines.join('\n')}`);
            }
        }

        // /heist
        if (commandName === 'heist') {
            const targetUser = interaction.options.getUser('user');
            const guildId = interaction.guildId;

            if (targetUser.id === interaction.user.id)
                return interaction.reply({ content: 'Không thể tự cướp chính mình!', ephemeral: true });
            if (targetUser.bot)
                return interaction.reply({ content: 'Không thể cướp bot!', ephemeral: true });

            const attacker = await getOrCreateUser(interaction.user.id, guildId, interaction.user.username);
            const now = new Date();

            if (attacker.heistAttackCooldown && now < attacker.heistAttackCooldown) {
                const mins = Math.ceil((attacker.heistAttackCooldown - now) / 60000);
                return interaction.reply({ content: `⏳ Cooldown tấn công còn **${mins} phút** nữa.`, ephemeral: true });
            }

            const victim = await getOrCreateUser(targetUser.id, guildId, targetUser.username);
            if (victim.heistDefendCooldown && now < victim.heistDefendCooldown) {
                const mins = Math.ceil((victim.heistDefendCooldown - now) / 60000);
                return interaction.reply({ content: `🛡️ **${targetUser.username}** đang được bảo vệ, còn **${mins} phút** nữa.`, ephemeral: true });
            }

            const attackTeam = await loadTeam(interaction.user.id, guildId);
            if (!attackTeam.length)
                return interaction.reply({ content: 'Bạn chưa có đội hình! Dùng `/team set` trước.', ephemeral: true });

            const alarmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`heist_alarm_${interaction.user.id}_${targetUser.id}`)
                    .setLabel('🚨 Báo Động Đỏ!')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                content: `⚔️ **${interaction.user.username}** đang tấn công nhà **${targetUser.username}**!\n<@${targetUser.id}> có **60 giây** để bấm nút bên dưới!`,
                components: [alarmRow]
            });

            try {
                await targetUser.send(`🚨 **${interaction.user.username}** đang cướp nhà bạn trên server! Vào nhanh và bấm **Báo Động Đỏ** trong vòng 60 giây!`);
            } catch {}

            const heistMsg = await interaction.fetchReply();
            let alarmTriggered = false;

            const collector = heistMsg.createMessageComponentCollector({
                filter: i => i.user.id === targetUser.id && i.customId === `heist_alarm_${interaction.user.id}_${targetUser.id}`,
                time: 60000,
                max: 1
            });

            collector.on('collect', async i => {
                alarmTriggered = true;
                await i.update({ content: `🚨 **${targetUser.username}** kích hoạt **Báo Động Đỏ!** Team thủ +20% HP & DMG!`, components: [] });
            });

            collector.on('end', async () => {
                if (!alarmTriggered)
                    await interaction.editReply({ content: `⏰ **${targetUser.username}** không phản ứng kịp... Team thủ giữ nguyên chỉ số.`, components: [] });

                const defenseTeam = await loadTeam(targetUser.id, guildId);

                let resultMsg;
                if (!defenseTeam.length) {
                    resultMsg = `🏚️ **${targetUser.username}** không có đội hình phòng thủ — tấn công thành công mà không cần chiến đấu!`;
                } else {
                    const { logs, aWon } = runCombat(attackTeam, defenseTeam, alarmTriggered);

                    const chunks = [];
                    let chunk = '';
                    for (const log of logs) {
                        if (chunk.length + log.length + 2 > 1900) { chunks.push(chunk); chunk = log; }
                        else chunk += (chunk ? '\n\n' : '') + log;
                    }
                    if (chunk) chunks.push(chunk);
                    for (const c of chunks) await interaction.followUp(c);

                    if (!aWon) {
                        await interaction.followUp(`🛡️ **${targetUser.username}** phòng thủ thành công! Tấn công thất bại.`);
                        const cd3h = new Date(Date.now() + 3 * 60 * 60 * 1000);
                        const cd6h = new Date(Date.now() + 6 * 60 * 60 * 1000);
                        await User.updateOne({ discordId: interaction.user.id, guildId }, { $set: { heistAttackCooldown: cd3h } });
                        await User.updateOne({ discordId: targetUser.id, guildId }, { $set: { heistDefendCooldown: cd6h } });
                        return;
                    }
                    resultMsg = `🏆 **${interaction.user.username}** THẮNG!`;
                }

                const stealPct = 0.15 + Math.random() * 0.35;
                const stolen = Math.floor(victim.hacash * stealPct);
                await User.updateOne({ discordId: interaction.user.id, guildId }, { $inc: { hacash: stolen }, $set: { heistAttackCooldown: new Date(Date.now() + 3 * 60 * 60 * 1000) } });
                await User.updateOne({ discordId: targetUser.id, guildId }, { $inc: { hacash: -stolen }, $set: { heistDefendCooldown: new Date(Date.now() + 6 * 60 * 60 * 1000) } });

                const heistEmbeds = attackTeam
                    .filter(c => c.image_url)
                    .map(c => new EmbedBuilder()
                        .setTitle(`${c.rank === 'SSS' ? '🔱' : '👑'} ${c.name} [${c.rank}]`)
                        .setThumbnail(c.image_url)
                        .setColor(c.rank === 'SSS' ? 0xff4444 : 0xffd700)
                    );
                await interaction.followUp({ content: `${resultMsg}\n💰 Cướp **${Math.round(stealPct * 100)}%** két tiền — **+${stolen.toLocaleString()} hacash**`, embeds: heistEmbeds });
            });
            return;
        }

        // /roulette
        if (commandName === 'roulette') {
            const bet = interaction.options.getInteger('cuoc');
            const channelId = interaction.channelId;
            if (rouletteGames.has(channelId))
                return interaction.reply({ content: 'Đã có game đang chạy trong kênh này!', ephemeral: true });

            const host = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (host.hacash < bet)
                return interaction.reply({ content: `Không đủ hacash! Cần **${bet.toLocaleString()}**.`, ephemeral: true });

            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -bet } });

            rouletteGames.set(channelId, {
                hostId: interaction.user.id,
                channelId,
                guildId: interaction.guildId,
                bet,
                pool: bet,
                players: [{ id: interaction.user.id, username: interaction.user.username, hp: 2 }],
                chambers: [],
                chamberIdx: 0,
                turnIdx: 0,
                sawedOff: false,
                usedItems: new Set(),
                phase: 'lobby'
            });

            const joinRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rl_join_${channelId}`).setLabel('✅ Tham gia').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`rl_start_${channelId}`).setLabel('▶️ Bắt đầu').setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({
                content: `🎰 **Phòng Cò Quay Nga** | 💰 Cược: **${bet.toLocaleString()} hacash/người**\n\n**Người chơi (1/6):**\n1. ${interaction.user.username} (host)\n\nCần ít nhất 2 người. Bấm tham gia!`,
                components: [joinRow]
            });

            setTimeout(async () => {
                const game = rouletteGames.get(channelId);
                if (!game || game.phase !== 'lobby') return;
                rouletteGames.delete(channelId);
                for (const p of game.players)
                    await User.updateOne({ discordId: p.id, guildId: game.guildId }, { $inc: { hacash: game.bet } });
                await interaction.editReply({ content: `⏰ Phòng Cò Quay Nga tự hủy do không đủ người sau 60 giây. Đã hoàn tiền.`, components: [] }).catch(() => {});
            }, 60000);
            return;
        }

        // /setchannel
        if (commandName === 'setchannel') {
            await interaction.deferReply();
            await ServerConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { announcementChannelId: interaction.channelId },
                { upsert: true, new: true }
            );
            return interaction.editReply(`✅ Đã đặt <#${interaction.channelId}> làm channel thông báo.`);
        }

        // /setprefix
        if (commandName === 'setprefix') {
            await interaction.deferReply();
            const newPrefix = interaction.options.getString('prefix').trim();
            if (newPrefix.length < 1 || newPrefix.length > 20)
                return interaction.editReply('Prefix phải từ 1–20 ký tự.');
            await ServerConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { prefix: newPrefix },
                { upsert: true, new: true }
            );
            return interaction.editReply(`✅ Prefix đã đổi thành \`${newPrefix}\`. Dùng \`${newPrefix} <lệnh>\` để gọi.`);
        }

        // /setalias
        if (commandName === 'setalias') {
            await interaction.deferReply();
            const command = interaction.options.getString('command');
            const alias = interaction.options.getString('alias').trim().toLowerCase();
            await ServerConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $set: { [`commandAliases.${alias}`]: command } },
                { upsert: true, new: true }
            );
            return interaction.editReply(`✅ \`${alias}\` → \`${command}\` đã được đặt.`);
        }
    }

    // ── Select Menu ────────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
        const [matchId, homeTeam, awayTeam] = interaction.values[0].split('|');

        if (interaction.customId.startsWith('bw_select_')) {
            const ownerId = interaction.customId.slice('bw_select_'.length);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: 'Đây không phải lượt bet của bạn!', ephemeral: true });

            return interaction.update({
                content: `**🏆 Cược đội thắng**\n${teamStr(homeTeam)} vs ${teamStr(awayTeam)}\nChọn đội bạn muốn cược:`,
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_H_${ownerId}`).setLabel(`1️⃣  ${homeTeam}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_D_${ownerId}`).setLabel('🤝  Hòa').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_A_${ownerId}`).setLabel(`2️⃣  ${awayTeam}`.slice(0, 80)).setStyle(ButtonStyle.Primary)
                )]
            });
        }

        if (interaction.customId.startsWith('bs_select_')) {
            const ownerId = interaction.customId.slice('bs_select_'.length);
            if (interaction.user.id !== ownerId)
                return interaction.reply({ content: 'Đây không phải lượt bet của bạn!', ephemeral: true });

            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            const modal = new ModalBuilder()
                .setCustomId(`bs_m_${matchId}_${ownerId}`)
                .setTitle(`${homeTeam} vs ${awayTeam}`.slice(0, 45));
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('home_score')
                        .setLabel(`Bàn thắng: ${homeTeam}`.slice(0, 45))
                        .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true).setMaxLength(2)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('away_score')
                        .setLabel(`Bàn thắng: ${awayTeam}`.slice(0, 45))
                        .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true).setMaxLength(2)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('bet_amount')
                        .setLabel('Số hacash muốn cược')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder(`Số dư: ${user.hacash.toLocaleString()} hacash`)
                        .setRequired(true)
                )
            );
            return interaction.showModal(modal);
        }
    }

    // ── Roulette Select ────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rl_target_')) {
        const channelId = interaction.customId.replace('rl_target_', '');
        const game = rouletteGames.get(channelId);
        if (!game || game.phase !== 'playing') return interaction.reply({ content: 'Game không tồn tại!', ephemeral: true });
        const cur = game.players[game.turnIdx];
        if (interaction.user.id !== cur.id) return interaction.reply({ content: 'Không phải lượt của bạn!', ephemeral: true });
        const targetId = interaction.values[0];
        const target = game.players.find(p => p.id === targetId && p.hp > 0);
        if (!target) return interaction.reply({ content: 'Mục tiêu không hợp lệ!', ephemeral: true });
        await resolveRouletteShot(interaction, game, target, false);
        return;
    }

    // ── Roulette Buttons ────────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('rl_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const channelId = parts.slice(2).join('_');
        const game = rouletteGames.get(channelId);

        // Lobby join
        if (action === 'join') {
            if (!game || game.phase !== 'lobby') return interaction.reply({ content: 'Lobby không tồn tại!', ephemeral: true });
            if (game.players.find(p => p.id === interaction.user.id))
                return interaction.reply({ content: 'Bạn đã trong phòng rồi!', ephemeral: true });
            if (game.players.length >= 6) return interaction.reply({ content: 'Phòng đầy rồi!', ephemeral: true });
            const pl = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (pl.hacash < game.bet) return interaction.reply({ content: `Không đủ hacash! Cần **${game.bet.toLocaleString()}**.`, ephemeral: true });
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -game.bet } });
            game.players.push({ id: interaction.user.id, username: interaction.user.username, hp: 2 });
            game.pool += game.bet;
            const list = game.players.map((p, i) => `${i + 1}. ${p.username}${p.id === game.hostId ? ' (host)' : ''}`).join('\n');
            const joinRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rl_join_${channelId}`).setLabel('✅ Tham gia').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`rl_start_${channelId}`).setLabel('▶️ Bắt đầu').setStyle(ButtonStyle.Primary)
            );
            return interaction.update({ content: `🎰 **Phòng Cò Quay Nga** | 💰 Cược: **${game.bet.toLocaleString()} hacash/người**\n\n**Người chơi (${game.players.length}/6):**\n${list}`, components: [joinRow] });
        }

        // Lobby start
        if (action === 'start') {
            if (!game || game.phase !== 'lobby') return interaction.reply({ content: 'Lobby không tồn tại!', ephemeral: true });
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Chỉ host mới được bắt đầu!', ephemeral: true });
            if (game.players.length < 2) return interaction.reply({ content: 'Cần ít nhất 2 người!', ephemeral: true });
            game.phase = 'playing';
            game.chambers = createChambers();
            await interaction.update({ content: `🔫 Bắt đầu! Súng đã nạp **2 có đạn** / **4 không đạn**\n\n${buildRouletteMsg(game)}`, components: buildRouletteTurnComponents(game) });
            return;
        }

        // In-game actions
        if (!game || game.phase !== 'playing') return interaction.reply({ content: 'Không có game đang chạy!', ephemeral: true });
        const cur = game.players[game.turnIdx];
        if (interaction.user.id !== cur.id) return interaction.reply({ content: 'Không phải lượt của bạn!', ephemeral: true });

        if (action === 'kl') {
            if (game.usedItems.has('kl')) return interaction.reply({ content: 'Đã dùng kính lúp lượt này rồi!', ephemeral: true });
            const priceKL = Math.floor(game.bet * 0.2);
            const pl = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (pl.hacash < priceKL) return interaction.reply({ content: 'Không đủ hacash!', ephemeral: true });
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -priceKL } });
            game.pool += priceKL; game.usedItems.add('kl');
            const next = game.chambers[game.chamberIdx] === 'real' ? '🔴 **CÓ ĐẠN**' : '⚪ **Không đạn**';
            try {
                const dmUser = await interaction.client.users.fetch(cur.id);
                await dmUser.send(`🔍 Kính lúp: Viên tiếp theo là ${next}`);
                await interaction.reply({ content: '🔍 Đã DM cho bạn!', ephemeral: true });
            } catch {
                await interaction.reply({ content: `🔍 Viên tiếp theo: ${next}`, ephemeral: true });
            }
            await interaction.message.edit({ content: buildRouletteMsg(game), components: buildRouletteTurnComponents(game) });
            return;
        }

        if (action === 'cn') {
            if (game.usedItems.has('cn')) return interaction.reply({ content: 'Đã dùng cưa nòng lượt này rồi!', ephemeral: true });
            const priceCN = Math.floor(game.bet * 0.4);
            const pl = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (pl.hacash < priceCN) return interaction.reply({ content: 'Không đủ hacash!', ephemeral: true });
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -priceCN } });
            game.pool += priceCN; game.usedItems.add('cn'); game.sawedOff = true;
            await interaction.update({ content: buildRouletteMsg(game), components: buildRouletteTurnComponents(game) });
            return;
        }

        if (action === 'ru') {
            if (game.usedItems.has('ru')) return interaction.reply({ content: 'Đã dùng rượu lượt này rồi!', ephemeral: true });
            const priceRU = Math.floor(game.bet * 0.1);
            const pl = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (pl.hacash < priceRU) return interaction.reply({ content: 'Không đủ hacash!', ephemeral: true });
            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -priceRU } });
            game.pool += priceRU;
            const ejected = game.chambers[game.chamberIdx] === 'real' ? 'CÓ ĐẠN 🔴' : 'không đạn ⚪';
            game.chamberIdx++;
            if (game.chamberIdx >= game.chambers.length) { game.chambers = createChambers(); game.chamberIdx = 0; await interaction.channel.send('🔄 Súng hết! Nạp lại: **2 có đạn / 4 không đạn**'); }
            advanceTurn(game); game.usedItems = new Set(); game.sawedOff = false;
            await interaction.update({ content: `🍺 Eject! Viên đó là **${ejected}** — chuyển lượt\n\n${buildRouletteMsg(game)}`, components: buildRouletteTurnComponents(game) });
            return;
        }

        if (action === 'self') { await resolveRouletteShot(interaction, game, cur, true); return; }

        if (action === 'other') {
            const others = game.players.filter(p => p.hp > 0 && p.id !== cur.id);
            if (!others.length) return interaction.reply({ content: 'Không còn ai để bắn!', ephemeral: true });
            if (others.length === 1) { await resolveRouletteShot(interaction, game, others[0], false); return; }
            const select = new StringSelectMenuBuilder()
                .setCustomId(`rl_target_${channelId}`)
                .setPlaceholder('Chọn mục tiêu...')
                .addOptions(others.map(p => ({ label: p.username, value: p.id })));
            await interaction.update({ content: buildRouletteMsg(game), components: [new ActionRowBuilder().addComponents(select)] });
            return;
        }
    }

    // ── Buttons ────────────────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('bw_t_')) {
        const parts = interaction.customId.split('_');
        // bw_t_{matchId}_{code}_{ownerId}
        const ownerId = parts[4];
        if (interaction.user.id !== ownerId)
            return interaction.reply({ content: 'Đây không phải lượt bet của bạn!', ephemeral: true });

        const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
        const modal = new ModalBuilder()
            .setCustomId(`bw_m_${parts[2]}_${parts[3]}`)
            .setTitle('Nhập số hacash muốn cược');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('bet_amount')
                    .setLabel('Số hacash muốn cược')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Số dư: ${user.hacash.toLocaleString()} hacash`)
                    .setRequired(true)
            )
        );
        return interaction.showModal(modal);
    }

    // ── Modal Submit ───────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId.startsWith('bw_m_')) {
            await interaction.deferReply();
            const parts = customId.split('_');
            const matchId = parseInt(parts[2]), teamCode = parts[3];
            const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));

            if (isNaN(amount) || amount < 1) return interaction.editReply('Số tiền không hợp lệ.');
            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (user.hacash < amount) return interaction.editReply(`Không đủ hacash! Bạn có **${user.hacash.toLocaleString()} hacash**.`);

            let matchData;
            try {
                const { data } = await axios.get(`${WC_BASE}/matches/${matchId}`, { headers: WC_HEADERS });
                matchData = data;
            } catch { return interaction.editReply('Lỗi khi kiểm tra trận đấu.'); }

            if (!['SCHEDULED', 'TIMED'].includes(matchData.status))
                return interaction.editReply('Trận này đã bắt đầu hoặc kết thúc rồi!');

            const homeTeam = matchData.homeTeam.name, awayTeam = matchData.awayTeam.name;
            const predictedWinner = teamCode === 'H' ? 'HOME_TEAM' : teamCode === 'A' ? 'AWAY_TEAM' : 'DRAW';
            const predLabel = teamCode === 'H' ? teamStr(homeTeam) : teamCode === 'A' ? teamStr(awayTeam) : '🤝 Hòa';

            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -amount } });
            await Prediction.create({
                discordId: interaction.user.id, guildId: interaction.guildId,
                username: interaction.user.username, matchId, homeTeam, awayTeam,
                matchDate: new Date(matchData.utcDate), type: 'winner', predictedWinner, betAmount: amount
            });

            return interaction.editReply([
                `✅ **${interaction.user.username}** vừa đặt cược!`,
                `${teamStr(homeTeam)} vs ${teamStr(awayTeam)}`,
                `Dự đoán: ${predLabel} | Cược: **${amount.toLocaleString()}** | Thắng: **${(amount * 3).toLocaleString()} hacash**`
            ].join('\n'));
        }

        if (customId.startsWith('bs_m_')) {
            await interaction.deferReply();
            const matchId = parseInt(customId.slice('bs_m_'.length));
            const homeScore = parseInt(interaction.fields.getTextInputValue('home_score'));
            const awayScore = parseInt(interaction.fields.getTextInputValue('away_score'));
            const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));

            if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0)
                return interaction.editReply('Tỉ số không hợp lệ.');
            if (isNaN(amount) || amount < 1) return interaction.editReply('Số tiền không hợp lệ.');

            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            if (user.hacash < amount) return interaction.editReply(`Không đủ hacash! Bạn có **${user.hacash.toLocaleString()} hacash**.`);

            let matchData;
            try {
                const { data } = await axios.get(`${WC_BASE}/matches/${matchId}`, { headers: WC_HEADERS });
                matchData = data;
            } catch { return interaction.editReply('Lỗi khi kiểm tra trận đấu.'); }

            if (!['SCHEDULED', 'TIMED'].includes(matchData.status))
                return interaction.editReply('Trận này đã bắt đầu hoặc kết thúc rồi!');

            const homeTeam = matchData.homeTeam.name, awayTeam = matchData.awayTeam.name;

            await User.updateOne({ discordId: interaction.user.id, guildId: interaction.guildId }, { $inc: { hacash: -amount } });
            await Prediction.create({
                discordId: interaction.user.id, guildId: interaction.guildId,
                username: interaction.user.username, matchId, homeTeam, awayTeam,
                matchDate: new Date(matchData.utcDate), type: 'score',
                predictedHome: homeScore, predictedAway: awayScore, betAmount: amount
            });

            return interaction.editReply([
                `✅ **${interaction.user.username}** vừa đặt cược!`,
                `${teamStr(homeTeam)} vs ${teamStr(awayTeam)}`,
                `Tỉ số: **${homeScore} - ${awayScore}** | Cược: **${amount.toLocaleString()}** | Thắng: **${(amount * 10).toLocaleString()} hacash**`
            ].join('\n'));
        }
    }
});

// ── Message Commands ──────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guildId) return;
    const content = message.content.trim();
    const { author, guildId } = message;

    const config = await ServerConfig.findOne({ guildId });
    const prefix = config?.prefix ?? 'hacash';

    if (!content.toLowerCase().startsWith(prefix.toLowerCase() + ' ')) return;

    const args = content.slice(prefix.length + 1).trim().split(/\s+/);
    const rawCmd = args[0]?.toLowerCase();
    const cmd = config?.commandAliases?.get(rawCmd) ?? rawCmd;

    if (cmd === 'latxu') {
        const hasS = args[1]?.toLowerCase() === 's';
        const choice = hasS ? 'sấp' : 'ngửa';
        const amountArg = hasS ? args[2] : args[1];
        const isAll = amountArg?.toLowerCase() === 'all';

        const user = await getOrCreateUser(author.id, guildId, author.username);
        const amount = Math.min(isAll ? user.hacash : parseInt(amountArg), 500000);

        if (isAll && user.hacash < 1)
            return message.reply('Bạn không có hacash nào để cược!');

        if (!isAll && (isNaN(amount) || amount < 1))
            return message.reply(`Nhập số tiền hợp lệ. VD: \`${prefix} latxu 300\` hoặc \`${prefix} latxu all\``);

        if (user.hacash < amount)
            return message.reply(`Không đủ hacash! Bạn có **${user.hacash.toLocaleString()} hacash**.`);

        const roll = Math.floor(Math.random() * 1000) + 1;
        const result = roll % 2 === 0 ? 'ngửa' : 'sấp';
        const win = result === choice;
        const payout = win ? amount : -amount;

        await User.updateOne({ discordId: author.id, guildId }, { $inc: { hacash: payout } });

        await message.channel.sendTyping();
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

        return message.reply([
            `${win ? '🎉' : '💸'} **Lật xu** — **${author.username}**`,
            `Bạn chọn: **${choice}** | Kết quả: **${result}**`,
            `${win ? `+${amount.toLocaleString()}` : `-${amount.toLocaleString()}`} hacash | Số dư: **${(user.hacash + payout).toLocaleString()} hacash**`
        ].join('\n'));
    }

    if (cmd === 'daily') {
        const user = await getOrCreateUser(author.id, guildId, author.username);
        const nowVN = toVNTime(new Date());
        const todayStr = nowVN.toISOString().slice(0, 10);

        if (user.lastDaily && toVNTime(user.lastDaily).toISOString().slice(0, 10) === todayStr) {
            const next = new Date(nowVN);
            next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0);
            return message.reply(`**${author.username}** đã nhận daily rồi! Quay lại sau **${Math.ceil((next - nowVN) / 3600000)} tiếng** nữa nhé.`);
        }

        const reward = Math.floor(Math.random() * 9001) + 1000;
        await User.updateOne({ discordId: author.id, guildId }, { $inc: { hacash: reward }, lastDaily: new Date() });
        return message.reply(`Chào ngày mới **${author.username}** gay, đây là lương ngày của bạn: **${reward.toLocaleString()}** 💵`);
    }

    if (cmd === 'balance') {
        const user = await getOrCreateUser(author.id, guildId, author.username);
        const pending = await Prediction.find({ discordId: author.id, guildId });
        const inPlay = pending.reduce((s, p) => s + p.betAmount, 0);
        return message.reply([
            `💼 **${author.username}**`,
            `Số dư: **${user.hacash.toLocaleString()} hacash**`,
            `Đang cược: ${inPlay.toLocaleString()} hacash (${pending.length} cược)`
        ].join('\n'));
    }

    if (cmd === 'matches') {
        try {
            const [live, upcoming] = await Promise.all([fetchLiveMatches(), fetchUpcomingMatches(5)]);
            const lines = [];

            if (live.length) {
                lines.push('**🔴 Đang diễn ra**');
                live.forEach(m => {
                    const h = m.score?.fullTime?.home, a = m.score?.fullTime?.away;
                    const score = h != null ? `**${h} - ${a}**` : '⏳';
                    lines.push(`${teamStr(m.homeTeam.name)} ${score} ${teamStr(m.awayTeam.name)}${m.status === 'PAUSED' ? ' _(Nghỉ giữa hiệp)_' : ''}`);
                });
                lines.push('');
            }

            lines.push('**📅 5 Trận tiếp theo**');
            if (upcoming.length) {
                upcoming.forEach(m =>
                    lines.push(`${formatVNTime(m.utcDate)} ICT — ${teamStr(m.homeTeam.name)} vs ${teamStr(m.awayTeam.name)}`)
                );
            } else {
                lines.push('_Không có trận nào sắp diễn ra._');
            }

            return message.reply(lines.join('\n'));
        } catch { return message.reply('Lỗi khi lấy dữ liệu. Thử lại sau nhé.'); }
    }

    if (cmd === 'mybet') {
        const preds = await Prediction.find({ discordId: author.id, guildId }).sort({ createdAt: -1 });
        if (!preds.length) return message.reply('Bạn không có cược nào đang chờ kết quả.');

        const lines = [`📋 **Cược của ${author.username}**`, ''];
        preds.forEach(p => {
            const predStr = p.type === 'winner'
                ? (p.predictedWinner === 'HOME_TEAM' ? teamStr(p.homeTeam) : p.predictedWinner === 'AWAY_TEAM' ? teamStr(p.awayTeam) : '🤝 Hòa')
                : `${p.predictedHome} - ${p.predictedAway}`;
            lines.push(`⏳ ${teamStr(p.homeTeam)} vs ${teamStr(p.awayTeam)} — ${predStr} — **${p.betAmount.toLocaleString()} hacash**`);
        });
        return message.reply(lines.join('\n'));
    }

    if (cmd === 'leaderboard') {
        const top = await User.find({ guildId }).sort({ hacash: -1 }).limit(10);
        if (!top.length) return message.reply('Chưa có ai trong bảng xếp hạng.');
        const lines = top.map((u, i) => `${i + 1}. ${u.username ?? 'Unknown'} - ${u.hacash.toLocaleString()} hacash`);
        return message.reply(`# Bảng xếp hạng Hacash\nServer: ${message.guild.name}\n\n${lines.join('\n')}`);
    }

    if (cmd === 'gacha') {
        const now = Date.now();
        const last = gachaCooldown.get(author.id) ?? 0;
        if (now - last < 7000) {
            const remaining = 7000 - (now - last);
            message.reply(`Chờ **${(remaining / 1000).toFixed(1)}s** nữa nhé!`)
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), remaining));
            return;
        }
        gachaCooldown.set(author.id, now);

        const count = args[1] === '10' ? 10 : 1;
        const cost = count * 500;
        const user = await getOrCreateUser(author.id, guildId, author.username);

        if (user.hacash < cost)
            return message.reply(`Không đủ hacash! Cần **${cost.toLocaleString()}**, bạn có **${user.hacash.toLocaleString()}**.`);

        const { results, newPity } = doGacha(count, user.gachaPity ?? 0);
        const cashEarned = results.filter(c => !['S', 'SSS'].includes(c.rank)).reduce((s, c) => s + c.value, 0);
        const net = cashEarned - cost;

        await User.updateOne(
            { discordId: author.id, guildId },
            { $inc: { hacash: net }, $set: { gachaPity: newPity } }
        );

        let autoSellTotal = 0;
        for (const char of results.filter(c => ['S', 'SSS'].includes(c.rank))) {
            const threshold = char.rank === 'SSS' ? 3 : 9;
            const updated = await UserCharacter.findOneAndUpdate(
                { userId: author.id, guildId, characterId: char._id },
                { $inc: { count: 1 } },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );
            if (updated.count > threshold) { char.autoSold = true; autoSellTotal += char.value; }
        }
        if (autoSellTotal > 0)
            await User.updateOne({ discordId: author.id, guildId }, { $inc: { hacash: autoSellTotal } });

        return message.reply(buildGachaOutput(results));
    }

    if (cmd === 'send') {
        const mentionMatch = args[1]?.match(/^<@!?(\d+)>$/);
        const amount = parseInt(args[2]);

        if (!mentionMatch || isNaN(amount) || amount < 1)
            return message.reply(`Cú pháp: \`${prefix} send @người <số tiền>\``);

        const targetId = mentionMatch[1];

        if (targetId === author.id)
            return message.reply('Không thể tự gửi cho mình!');

        const sender = await getOrCreateUser(author.id, guildId, author.username);

        const nowVN = toVNTime(new Date());
        const todayStr = nowVN.toISOString().slice(0, 10);
        const lastStr = sender.lastSentDate ? toVNTime(sender.lastSentDate).toISOString().slice(0, 10) : null;
        const alreadySent = lastStr === todayStr ? (sender.dailySentAmount ?? 0) : 0;
        const remaining = 200000 - alreadySent;

        if (remaining <= 0)
            return message.reply(`Hôm nay bạn đã gửi đủ **200,000 hacash** rồi. Quay lại ngày mai nhé!`);

        if (amount > remaining)
            return message.reply(`Bạn chỉ còn có thể gửi **${remaining.toLocaleString()} hacash** hôm nay (giới hạn 200,000/ngày).`);

        if (sender.hacash < amount)
            return message.reply(`Không đủ hacash! Bạn có **${sender.hacash.toLocaleString()} hacash**.`);

        const recipient = await User.findOne({ guildId, discordId: targetId });
        if (!recipient)
            return message.reply(`Người đó chưa dùng bot lần nào trong server này!`);

        const updateOp = lastStr === todayStr
            ? { $inc: { hacash: -amount, dailySentAmount: amount }, $set: { lastSentDate: new Date() } }
            : { $inc: { hacash: -amount }, $set: { dailySentAmount: amount, lastSentDate: new Date() } };

        await User.updateOne({ discordId: author.id, guildId }, updateOp);
        await User.updateOne({ _id: recipient._id }, { $inc: { hacash: amount } });

        return message.reply(`✅ Đã gửi **${amount.toLocaleString()} hacash** cho <@${targetId}>. Còn có thể gửi hôm nay: **${(remaining - amount).toLocaleString()} hacash**.`);
    }

    if (cmd === 'betwin' || cmd === 'bettiso') {
        return message.reply(`Dùng **/${cmd}** để cược — cần chọn trận qua menu.`);
    }
});

client.login(process.env.DISCORD_TOKEN);

const http = require('http');
http.createServer((req, res) => { res.writeHead(200); res.end('Bot is alive!'); })
    .listen(process.env.PORT || 3000, () => console.log(`Web server running on port ${process.env.PORT || 3000}`));
