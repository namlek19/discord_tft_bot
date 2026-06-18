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
                    { name: 'latxu', value: 'latxu' }
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

function buildMatchSelectMenu(matches, type) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${type}_select`)
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

    setInterval(settlePredictions, 5 * 60 * 1000);
    setInterval(checkMatchReminders, 5 * 60 * 1000);
});

// ── Interactions ──────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

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
                `\`/daily\` : nhận hacash hàng ngày : \`/daily\``,
                `\`/balance\` : xem số dư : \`/balance\``,
                `\`/leaderboard\` : bảng xếp hạng server : \`/leaderboard\``,
                `\`/matches\` : trận đang diễn ra & sắp tới : \`/matches\``,
                `\`/betwin\` : cược đội thắng/hòa (x3) : \`/betwin\``,
                `\`/bettiso\` : cược tỉ số chính xác (x10) : \`/bettiso\``,
                `\`/mybet\` : xem cược đang chờ kết quả : \`/mybet\``,
                `\`${p} latxu\` : lật xu ăn x1 : \`${p} latxu [s] <số tiền | all>\``,
                `\`/setchannel\` : đặt channel thông báo trận (Admin) : \`/setchannel\``,
                `\`/setprefix\` : đổi prefix lệnh chat (Admin) : \`/setprefix <prefix>\``,
                `\`/setalias\` : đặt tên rút gọn cho lệnh (Admin) : \`/setalias <lệnh> <alias>\``,
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
                    components: [buildMatchSelectMenu(matches, 'bw')]
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
                    components: [buildMatchSelectMenu(matches, 'bs')]
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

        if (interaction.customId === 'bw_select') {
            return interaction.update({
                content: `**🏆 Cược đội thắng**\n${teamStr(homeTeam)} vs ${teamStr(awayTeam)}\nChọn đội bạn muốn cược:`,
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_H`).setLabel(`1️⃣  ${homeTeam}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_D`).setLabel('🤝  Hòa').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`bw_t_${matchId}_A`).setLabel(`2️⃣  ${awayTeam}`.slice(0, 80)).setStyle(ButtonStyle.Primary)
                )]
            });
        }

        if (interaction.customId === 'bs_select') {
            const user = await getOrCreateUser(interaction.user.id, interaction.guildId, interaction.user.username);
            const modal = new ModalBuilder()
                .setCustomId(`bs_m_${matchId}`)
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

    // ── Buttons ────────────────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('bw_t_')) {
        const parts = interaction.customId.split('_');
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
            const matchId = parseInt(customId.replace('bs_m_', ''));
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

    if (cmd === 'betwin' || cmd === 'bettiso') {
        return message.reply(`Dùng **/${cmd}** để cược — cần chọn trận qua menu.`);
    }
});

client.login(process.env.DISCORD_TOKEN);

const http = require('http');
http.createServer((req, res) => { res.writeHead(200); res.end('Bot is alive!'); })
    .listen(process.env.PORT || 3000, () => console.log(`Web server running on port ${process.env.PORT || 3000}`));
