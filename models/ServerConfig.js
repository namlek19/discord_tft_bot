const mongoose = require('mongoose');

const serverConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    announcementChannelId: String,
    prefix: { type: String, default: 'hacash' },
    commandAliases: { type: Map, of: String, default: () => ({}) }
});

module.exports = mongoose.model('ServerConfig', serverConfigSchema);
