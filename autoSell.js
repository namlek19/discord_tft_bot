require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const UserCharacter = require('./models/UserCharacter');
const Character = require('./models/Character');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const characters = await Character.find().lean();
    const allUC = await UserCharacter.find().lean();

    let totalRecords = 0;
    let totalPaid = 0;

    for (const uc of allUC) {
        const char = characters.find(c => c._id.toString() === uc.characterId.toString());
        if (!char || !['S', 'SSS'].includes(char.rank)) continue;

        const threshold = char.rank === 'SSS' ? 3 : 9;
        const excess = uc.count - threshold;
        if (excess <= 0) continue;

        const earned = excess * char.value;
        await User.updateOne(
            { discordId: uc.userId, guildId: uc.guildId },
            { $inc: { hacash: earned } }
        );

        console.log(`  userId=${uc.userId} | ${char.name} [${char.rank}] | count=${uc.count} | excess=${excess} | +${earned.toLocaleString()} hacash`);
        totalPaid += earned;
        totalRecords++;
    }

    if (totalRecords === 0) {
        console.log('Không có bản dư nào cần hoàn tiền.');
    } else {
        console.log(`\n✅ Xong! Hoàn tiền ${totalPaid.toLocaleString()} hacash cho ${totalRecords} bản ghi.`);
    }

    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
