# Real-Time Chat Application 

A full-stack, real-time messaging application built with the MERN stack and WebSockets. It features secure JWT authentication, direct 1-on-1 messaging, real-time online presence tracking, and infinite scrolling pagination.

## Tech Stack
* **Frontend:** React.js, Socket.io-client
* **Backend:** Node.js, Express.js, Socket.io
* **Database:** MongoDB, Mongoose
* **Security:** JSON Web Tokens (JWT), bcryptjs

## Prerequisites
To run this project locally, you will need:
* [Node.js](https://nodejs.org/) installed on your machine.
* A running MongoDB database (either a local instance or a cloud cluster via MongoDB Atlas).

## Installation & Setup

**1. Clone the repository**
\`\`\`bash
git clone https://github.com/Affankhan569/Real-Time-Chat-App.git
cd Real-Time-Chat-App
\`\`\`

**2. Setup the Backend Server**
Open a terminal and navigate to the `chat-server` directory:
\`\`\`bash
cd chat-server
npm install
\`\`\`

Create a `.env` file in the root of the `chat-server` directory and add the following variables:
\`\`\`env
PORT=3001
JWT_SECRET=your_super_secret_key_here
MONGO_URI=your_mongodb_connection_string_here
\`\`\`

Start the backend server:
\`\`\`bash
node index.js
\`\`\`

**3. Setup the Frontend Application**
Open a *new* terminal and navigate to the `chatapplication` directory:
\`\`\`bash
cd chatapplication
npm install
\`\`\`

Start the React development server:
\`\`\`bash
npm run dev
\`\`\`

## 🎮 Usage
Once both servers are running, open your browser and navigate to `http://localhost:5173`. 
1. Register a new user account.
2. Open a second browser window (or incognito mode) and register a second account.
3. Use the contact list on the left pane to start a secure, real-time direct message!
