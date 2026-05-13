require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Tra cứu dữ liệu TFT')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Tên in-game (VD: Namblee#Mar30)')
                .setRequired(true)
        )
].map(command => command.toJSON());

function getRankColor(tier) {
    if (!tier) return '#2b2d31';
    
    switch (tier.toUpperCase()) {
        case 'IRON': return '#595959'; 
        case 'BRONZE': return '#965a38';
        case 'SILVER': return '#a6a6a6';
        case 'GOLD': return '#ffd700';
        case 'PLATINUM': return '#78b5b1';
        case 'EMERALD': return '#2ecc71';
        case 'DIAMOND': return '#5b5af5';
        case 'MASTER': return '#b83cb8';
        case 'GRANDMASTER': return '#ff3333';
        case 'CHALLENGER': return '#00ffff';
        default: return '#2b2d31'; 
    }
}

async function fetchTFTData(gameName, tagLine) {
    const API_KEY = process.env.RIOT_API_KEY;
    const headers = { "X-Riot-Token": API_KEY };

    try {
        const accountUrl = `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
        const accountRes = await axios.get(accountUrl, { headers });
        const puuid = accountRes.data.puuid;

        const summonerUrl = `https://vn2.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${puuid}`;
        const summonerRes = await axios.get(summonerUrl, { headers });
        const iconId = summonerRes.data.profileIconId;
        const thumbnailUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;

        const rankUrl = `https://vn2.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`;
        let rankString = "Unranked";
        let totalGames = 0;
        let top4Rate = 0;
        let embedColor = '#2b2d31';

        try {
            const rankRes = await axios.get(rankUrl, { headers });
            if (rankRes.data && rankRes.data.length > 0) {
                const rankData = rankRes.data[0];
                rankString = `${rankData.tier} ${rankData.rank} (${rankData.leaguePoints} LP)`;
                
                totalGames = rankData.wins + rankData.losses;
                top4Rate = totalGames > 0 ? ((rankData.wins / totalGames) * 100).toFixed(1) : 0;
                
                embedColor = getRankColor(rankData.tier);
            }
        } catch (e) {
            console.log("Chưa có dữ liệu Rank.");
        }

        const matchIdsUrl = `https://sea.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?count=10`;
        const matchIdsRes = await axios.get(matchIdsUrl, { headers });
        const matchIds = matchIdsRes.data;

        let history = [];
        for (const matchId of matchIds) {
            const matchUrl = `https://sea.api.riotgames.com/tft/match/v1/matches/${matchId}`;
            const matchRes = await axios.get(matchUrl, { headers });
            const participant = matchRes.data.info.participants.find(p => p.puuid === puuid);
            
            if (participant) {
                history.push(participant.placement);
            }
        }

        const formattedHistory = history.map(top => {
            if (top === 1) return `\u001b[1;35m${top}\u001b[0m`; 
            if (top === 2) return `\u001b[1;34m${top}\u001b[0m`; 
            if (top === 3) return `\u001b[1;32m${top}\u001b[0m`; 
            if (top === 4) return `\u001b[1;33m${top}\u001b[0m`; 
            return `${top}`;
        }).join(', ');
        
        const ansiString = `\`\`\`ansi\n${formattedHistory}\n\`\`\``;

        return {
            success: true,
            rank: rankString,
            thumbnailUrl: thumbnailUrl,
            totalGames: totalGames,
            top4Rate: top4Rate,
            ansiHistory: ansiString,
            embedColor: embedColor
        };

    } catch (error) {
        return { success: false, error: error.response ? error.response.status : 'Lỗi không xác định' };
    }
}

client.once('ready', async () => {
    console.log(`✅ Nambot is online as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'stats') {
        await interaction.deferReply(); 

        const playerInput = interaction.options.getString('player');
        const [gameName, tagLine] = playerInput.split('#');

        if (!gameName || !tagLine) {
            return interaction.editReply('Sai format. VD: Namblee#Mar30');
        }

        const data = await fetchTFTData(gameName, tagLine);

        if (!data.success) {
            return interaction.editReply(`Không tìm thấy dữ liệu cho **${playerInput}**.`);
        }

        const statsEmbed = new EmbedBuilder()
            .setColor(data.embedColor)
            .setTitle(`Account: ${gameName}`)
            .setDescription(`Tagline: #${tagLine}`)
            .setThumbnail(data.thumbnailUrl)
            .addFields(
                { name: 'Rank', value: `**${data.rank}**`, inline: false },
                { name: 'Total games', value: `${data.totalGames}`, inline: true },
                { name: '% Top 4', value: `${data.top4Rate}%`, inline: true },
                { name: `LSĐ (10 game):`, value: data.ansiHistory, inline: false }
            )
            .setFooter({ text: 'Riot API' })
            .setTimestamp();

        await interaction.editReply({ embeds: [statsEmbed] });
    }
});

client.login(process.env.DISCORD_TOKEN);

const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive!');
}).listen(port, () => {
    console.log(`Web server đang chạy trên port ${port} để giữ bot sống.`);
});