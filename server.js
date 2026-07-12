const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg'); 
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database connection URL from Render[cite: 1]
const dbLink = "postgresql://spin_chat_db_user:e5zMRAGoUJeD5wz7XrnI6eg7EII63pCf@dpg-d99sd5ks728c73dpu3v0-a.virginia-postgres.render.com/spin_chat_db"; 

const pool = new Pool({
    connectionString: dbLink,
    ssl: { rejectUnauthorized: false }
});

app.use(express.static(path.join(__dirname, 'public')));

// Create messages table with event, team, and file upload support
pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message_text TEXT,
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).then(() => console.log("Database table initialized successfully."))
  .catch(err => console.error("Database initialization error:", err));

// Socket.io connection handler
io.on('connection', (socket) => {
    
    // Join specific event and team room automatically
    socket.on('join_room', (data) => {
        const { event_id, team_id } = data;
        const roomName = `${event_id}_${team_id}`;
        socket.join(roomName);
        console.log(`User joined room: ${roomName}`);

        // Load old messages and photos for this specific room
        pool.query('SELECT * FROM messages WHERE event_id = $1 AND team_id = $2 ORDER BY created_at ASC', [event_id, team_id])
            .then(res => {
                socket.emit('load_messages', res.rows);
            });
    });

    // Handle incoming messages or photo uploads
    socket.on('send_message', (data) => {
        const { event_id, team_id, sender_name, message_text, file_url } = data;
        const roomName = `${event_id}_${team_id}`;
        
        // Save message securely in PostgreSQL database[cite: 1]
        pool.query('INSERT INTO messages (event_id, team_id, sender_name, message_text, file_url) VALUES ($1, $2, $3, $4, $5) RETURNING *', 
        [event_id, team_id, sender_name, message_text, file_url])
        .then((res) => {
            // Broadcast message only to participants inside this specific room
            io.to(roomName).emit('receive_message', res.rows[0]);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Chat server is running on port ${PORT}...`);
});