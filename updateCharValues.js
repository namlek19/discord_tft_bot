require('dotenv').config();
const mongoose = require('mongoose');
const Character = require('./models/Character');

const newValues = {
    'Bí Thư Học Đường': 600000,
    '7 Chọ':            100000,
    'Sa Tị':            110000,
    'Lính Khanh':       120000,
};

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    for (const [name, value] of Object.entries(newValues)) {
        const res = await Character.updateOne({ name }, { $set: { value } });
        console.log(`${name}: ${res.modifiedCount ? `✅ → ${value.toLocaleString()}` : '❌ không tìm thấy'}`);
    }
    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
