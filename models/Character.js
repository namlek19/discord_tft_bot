const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rank: { type: String, enum: ['C', 'B', 'A', 'S', 'SSS'], required: true },
    value: { type: Number, required: true },
    role: { type: String, enum: ['tank', 'dps'], default: null },
    hp_base: { type: Number, default: null },
    dmg_base: { type: Number, default: null },
    image_url: { type: String, default: null }
});

module.exports = mongoose.model('Character', characterSchema);
