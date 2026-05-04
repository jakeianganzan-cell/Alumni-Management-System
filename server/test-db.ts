import db from './db.ts';

async function testInsert() {
    try {
        // INSERT DATA
        const result = await db.execute(
            `INSERT INTO events (title, description, date, status, capacity, views, success_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                "Test Event",
                "This is a test event from Node.js",
                "2026-04-15",
                "upcoming",
                100,
                0,
                0
            ]
        );

        console.log("🟢 INSERT RESULT:", result);

        // FETCH DATA BACK
        const events = await db.query("SELECT * FROM events");
        console.log("📦 ALL EVENTS:", events);

        console.log("✅ DATA SUCCESSFULLY SAVED TO MYSQL");
    } catch (err) {
        console.error("❌ ERROR:", err);
    }
}

testInsert();