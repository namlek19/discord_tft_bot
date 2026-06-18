require('dotenv').config();
const mongoose = require('mongoose');
const Character = require('./models/Character');

const characters = [
    { name: '7 Chọ',             rank: 'S', value: 50000 },
    { name: 'Sa Tị',             rank: 'S', value: 55000 },
    { name: 'Lính Khanh',        rank: 'S', value: 60000 },
    { name: 'Tá Senu',           rank: 'A', value: 2200 },
    { name: 'Lady Quần Tất Đen', rank: 'A', value: 2500 },
    { name: 'Đị Mi Xô',         rank: 'A', value: 2500 },
    { name: 'Trình Hà Lân',      rank: 'A', value: 2800 },
    { name: 'Piggy',             rank: 'A', value: 3000 },
    { name: 'Yua Mikami',        rank: 'A', value: 3200 },
    { name: 'Long Chul',         rank: 'B', value: 600 },
    { name: 'Jul Pham',          rank: 'B', value: 650 },
    { name: 'Ngọc Cream',        rank: 'B', value: 700 },
    { name: 'Vayne Top',         rank: 'B', value: 700 },
    { name: 'Chou',              rank: 'B', value: 750 },
    { name: 'Huster',            rank: 'B', value: 750 },
    { name: 'Peter Parker',      rank: 'B', value: 800 },
    { name: 'Sunshine',          rank: 'B', value: 850 },
    { name: 'Minh Béo',          rank: 'C', value: 200 },
    { name: 'Thằng Cu',          rank: 'C', value: 250 },
    { name: 'Loan Còi',          rank: 'C', value: 250 },
    { name: 'Bắp Rang',          rank: 'C', value: 300 },
    { name: 'Đức Còm',           rank: 'C', value: 300 },
    { name: 'Tèo Sứt',           rank: 'C', value: 300 },
    { name: 'Cún Con',           rank: 'C', value: 350 },
    { name: 'Mít Ướt',           rank: 'C', value: 350 },
    { name: 'Tí Bự',             rank: 'C', value: 400 },
    { name: 'Hùng Lé',           rank: 'C', value: 400 },
    { name: 'Bé Mập',            rank: 'C', value: 400 },
    { name: 'Sang Xịn',          rank: 'C', value: 450 },
];

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    await Character.deleteMany({});
    await Character.insertMany(characters);
    console.log(`✅ Seeded ${characters.length} characters`);
    await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
