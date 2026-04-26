const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json()); 

const JWT_SECRET = "super_secret_e_learning_key";
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

mongoose.connect('mongodb://localhost:27017/ChatApp')
  .then(() => console.log('Connected to MongoDB!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// --- REST API ROUTES ---
app.post('/register', async (req, res) => {
  try {
    if (!req.body || !req.body.username) return res.status(400).json({ error: "Missing data." });
    const username = req.body.username.trim(); 
    const password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "Registration successful! Please log in." });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: "Username already exists" });
    res.status(400).json({ error: "Registration failed." });
  }
});

app.post('/login', async (req, res) => {
  try {
    const username = req.body.username.trim();
    const password = req.body.password;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "User not found" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// --- SOCKET MIDDLEWARE ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token provided"));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Invalid token"));
    socket.username = decoded.username; 
    next();
  });
});

// --- SECURE SOCKET LOGIC ---
const MESSAGES_PER_PAGE = 50; 
let activeGlobalUsers = new Map(); 

io.on('connection', (socket) => {
  console.log(`Verified User Connected: ${socket.username}`);
  
  activeGlobalUsers.set(socket.id, socket.username);
  const broadcastOnlineUsers = () => {
    const uniqueOnlineUsers = [...new Set(activeGlobalUsers.values())];
    io.emit('online_users_update', uniqueOnlineUsers);
  };
  broadcastOnlineUsers();

  socket.on('join_room', async (room) => {
    
    //  STRICT BOUNCER
    if (!room.includes('_')) {
      socket.emit('room_join_error', "Public rooms have been disabled.");
      return;
    }

    const allowedUsers = room.split('_'); 
    if (!allowedUsers.includes(socket.username)) {
      console.log(`SECURITY ALERT: ${socket.username} attempted to breach private room: ${room}`);
      socket.emit('room_join_error', "You are not authorized to view this private chat.");
      return; 
    }

    socket.rooms.forEach(r => {
        if (r !== socket.id) socket.leave(r);
    });

    socket.join(room);

    try {
      const recentMessages = await Message.find({ room: room })
        .sort({ timestamp: -1 })
        .limit(MESSAGES_PER_PAGE);
      socket.emit('receive_message_history', recentMessages.reverse());
    } catch (error) {
      console.error("Error fetching message history:", error);
    }
  });

  socket.on('load_more_messages', async ({ room, skip }) => {
    try {
      const olderMessages = await Message.find({ room: room })
        .sort({ timestamp: -1 }) 
        .skip(skip) 
        .limit(MESSAGES_PER_PAGE);
      socket.emit('receive_older_messages', olderMessages.reverse());
    } catch (error) {
      console.error("Error fetching older messages:", error);
    }
  });

  socket.on('send_message', async (data) => {
    const secureData = { ...data, author: socket.username }; 
    try {
      const newMessage = new Message(secureData);
      await newMessage.save();
    } catch (error) {
      console.error("Error saving message:", error);
    }
    socket.to(secureData.room).emit('receive_message', secureData);
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('typing_indicator', socket.username);
  });

  socket.on('disconnect', () => {
    activeGlobalUsers.delete(socket.id);
    broadcastOnlineUsers(); 
  });
});

server.listen(3001, () => {
  console.log('Secure Server running on port 3001');
});