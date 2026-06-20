const mongoose = require('mongoose');

const userCharacterSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
    count: { type: Number, default: 1 },
    level: { type: Number, default: 1 }
});

userCharacterSchema.index({ userId: 1, guildId: 1, characterId: 1 }, { unique: true });

module.exports = mongoose.model('UserCharacter', userCharacterSchema);
