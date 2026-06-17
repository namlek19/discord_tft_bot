const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true },
    guildId: { type: String, required: true },
    username: String,
    hacash: { type: Number, default: 0 },
    lastDaily: { type: Date, default: null }
});

userSchema.index({ discordId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
