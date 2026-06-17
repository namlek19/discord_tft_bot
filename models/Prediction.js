const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
    discordId: { type: String, required: true },
    guildId: { type: String, required: true },
    username: String,
    matchId: { type: Number, required: true },
    homeTeam: String,
    awayTeam: String,
    matchDate: Date,
    type: { type: String, enum: ['winner', 'score'], required: true },
    predictedWinner: String,   // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW'
    predictedHome: Number,
    predictedAway: Number,
    betAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'won', 'lost', 'partial'], default: 'pending' },
    payout: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    settledAt: Date
});

module.exports = mongoose.model('Prediction', predictionSchema);
