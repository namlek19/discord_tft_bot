require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await User.updateMany({}, { $inc: { hacash: 50000 } });
    console.log(`✅ Đã cộng 50,000 hacash cho ${result.modifiedCount} người`);
    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
