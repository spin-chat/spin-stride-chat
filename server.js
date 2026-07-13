const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg'); 
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database connection URL from Render
const dbLink = "postgresql://spin_chat_db_user:e5zMRAGoUJeD5wz7XrnI6eg7EII63pCf@dpg-d99sd5ks728c73dpu3v0-a.virginia-postgres.render.com/spin_chat_db"; 

const pool = new Pool({
    connectionString: dbLink,
    ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, 'public')));

pool.query(`
    DROP TABLE IF EXISTS messages;
    CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message_text TEXT,
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).then(() => console.log("डेटाबेस टेबल नए सिरे से रीसेट हो गई है।"))
  .catch(err => console.error("डेटाबेस एरर:", err));

io.on('connection', (socket) => {
    
    // Joint gateway handler for all three modes
    socket.on('join_room', (data) => {
        const { room_id, user } = data;
        
        // Leave previous rooms to prevent message leaking
        Array.from(socket.rooms).forEach(r => {
            if(r !== socket.id) socket.leave(r);
        });

        socket.join(room_id);
        console.log(`${user} entered operational workspace: ${room_id}`);

        // Fetch logs specific to this custom room context
        pool.query('SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC', [room_id])
            .then(res => {
                socket.emit('load_messages', res.rows);
            });
    });

    // Unified broadcast handler
    socket.on('send_message', (data) => {
        const { room_id, sender_name, message_text, file_url } = data;
        
        pool.query('INSERT INTO messages (room_id, sender_name, message_text, file_url) VALUES ($1, $2, $3, $4) RETURNING *', 
        [room_id, sender_name, message_text, file_url])
        .then((res) => {
            io.to(room_id).emit('receive_message', res.rows[0]);
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Spin & Stride multi-channel engine running on port ${PORT}...`);
});
