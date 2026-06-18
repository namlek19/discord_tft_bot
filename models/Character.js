const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rank: { type: String, enum: ['C', 'B', 'A', 'S'], required: true },
    value: { type: Number, required: true }
});

module.exports = mongoose.model('Character', characterSchema);
