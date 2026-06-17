const mongoose = require('mongoose');

const serverConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    announcementChannelId: String
});

module.exports = mongoose.model('ServerConfig', serverConfigSchema);
