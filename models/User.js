const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true },
    guildId: { type: String, required: true },
    username: String,
    hacash: { type: Number, default: 0 },
    lastDaily: { type: Date, default: null },
    gachaPity: { type: Number, default: 0 },
    dailySentAmount: { type: Number, default: 0 },
    lastSentDate: { type: Date, default: null },
    defenseTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
    heistAttackCooldown: { type: Date, default: null },
    heistDefendCooldown: { type: Date, default: null }
});

userSchema.index({ discordId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
