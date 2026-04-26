import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io("http://localhost:3001", { autoConnect: false });

function App() {
  const [authMode, setAuthMode] = useState("login"); 
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loggedInUser, setLoggedInUser] = useState("");
  const [authMessage, setAuthMessage] = useState({ text: "", type: "" });

  const [availableUsers, setAvailableUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]); 
  const [chatTarget, setChatTarget] = useState(""); 
  const [room, setRoom] = useState("");

  const [currentMessage, setCurrentMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [typingUser, setTypingUser] = useState(false);

  const chatWindowRef = useRef(null);
  const typingTimeoutRef = useRef(null); // 🛠️ FIX: Persistent timer reference
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // --- AUTHENTICATION ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMessage({ text: "", type: "" });
    const endpoint = authMode === "login" ? "/login" : "/register";
    try {
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await response.json();
      if (!response.ok) return setAuthMessage({ text: data.error, type: "error" });

      if (authMode === "register") {
        setAuthMode("login");
        setAuthMessage({ text: data.message, type: "success" });
        setPasswordInput(""); 
      } else {
        localStorage.setItem("chat_token", data.token);
        setLoggedInUser(data.username);
        setAuthMode("authenticated");
        socket.auth = { token: data.token };
        socket.connect();
      }
    } catch (err) {
      setAuthMessage({ text: "Network error.", type: "error" });
    }
  };

  useEffect(() => {
    if (authMode === "authenticated") {
      fetch("http://localhost:3001/users")
        .then((res) => res.json())
        .then((data) => {
          const otherUsers = data.map((u) => u.username).filter((name) => name !== loggedInUser);
          setAvailableUsers(otherUsers);
        })
        .catch((err) => console.error("Failed to fetch users", err));

      socket.on('online_users_update', (activeUsersArray) => {
        setOnlineUsers(activeUsersArray);
      });
    }
    return () => socket.off('online_users_update');
  }, [authMode, loggedInUser]);

  const handleLogout = () => {
    localStorage.removeItem("chat_token");
    socket.disconnect();
    setAuthMode("login");
    setRoom("");
    setMessageList([]);
    setPasswordInput("");
    setChatTarget(""); 
  };

  // --- CHAT LOGIC ---
  const startPrivateChat = (targetUser) => {
    const privateRoomId = [loggedInUser, targetUser]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .join("_");
    
    setRoom(privateRoomId);
    setChatTarget(targetUser); 
    setMessageList([]); 
    setHasMoreMessages(true);
    socket.emit("join_room", privateRoomId);
  };

  const sendMessage = async () => {
    if (currentMessage.trim() !== "") {
      const messageData = {
        room: room,
        message: currentMessage,
        time: new Date(Date.now()).getHours() + ":" + new Date(Date.now()).getMinutes().toString().padStart(2, '0'),
      };
      await socket.emit("send_message", messageData);
      setMessageList((list) => [...list, { ...messageData, author: loggedInUser }]);
      setCurrentMessage("");
      setTimeout(() => {
        if (chatWindowRef.current) chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }, 50);
    }
  };

  const handleTyping = (e) => {
    setCurrentMessage(e.target.value);
    socket.emit("typing", { room: room });
  };

  const handleScroll = () => {
    const container = chatWindowRef.current;
    if (container.scrollTop === 0 && hasMoreMessages && !isLoadingOlder) {
      setIsLoadingOlder(true);
      socket.emit("load_more_messages", { room: room, skip: messageList.length });
    }
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
      setTypingUser(false); // 🛠️ FIX: Turn off typing indicator instantly when message arrives
    };
    
    const handleMessageHistory = (history) => {
      setMessageList(history);
      if (history.length < 50) setHasMoreMessages(false);
      setTimeout(() => {
        if (chatWindowRef.current) chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }, 100);
    };

    const handleOlderMessages = (olderMessages) => {
      if (olderMessages.length < 50) setHasMoreMessages(false);
      if (olderMessages.length > 0) {
        const container = chatWindowRef.current;
        const previousScrollHeight = container.scrollHeight;
        setMessageList((prevList) => [...olderMessages, ...prevList]);
        setTimeout(() => {
          container.scrollTop = container.scrollHeight - previousScrollHeight;
        }, 0);
      }
      setIsLoadingOlder(false);
    };

    const handleRoomError = (errorMessage) => {
      alert(errorMessage); 
      setRoom("");         
      setChatTarget(""); 
    };

    const handleTypingIndicator = (author) => {
      setTypingUser(author);
      // 🛠️ FIX: Clear any existing timer using the ref
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      // 🛠️ FIX: Store the new timer in the ref
      typingTimeoutRef.current = setTimeout(() => {
        setTypingUser(false);
      }, 2000);
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("receive_message_history", handleMessageHistory);
    socket.on("receive_older_messages", handleOlderMessages);
    socket.on("typing_indicator", handleTypingIndicator);
    socket.on("room_join_error", handleRoomError);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("receive_message_history", handleMessageHistory);
      socket.off("receive_older_messages", handleOlderMessages);
      socket.off("typing_indicator", handleTypingIndicator);
      socket.off("room_join_error", handleRoomError);
      // We purposefully DO NOT clear the timeout here anymore so it doesn't break on re-renders
    };
  }, [messageList.length]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#d1d7db", fontFamily: "Segoe UI, sans-serif" }}>
      
      {authMode !== "authenticated" && (
        <form onSubmit={handleAuth} style={{ background: "white", padding: "40px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: "15px", width: "300px" }}>
          <h3 style={{ textAlign: "center", color: "#075e54", margin: 0 }}>{authMode === "login" ? "Secure Login" : "Register Account"}</h3>
          {authMessage.text && <p style={{ color: authMessage.type === "success" ? "green" : "red", fontSize: "14px", textAlign: "center", margin: 0, fontWeight: "bold" }}>{authMessage.text}</p>}
          <input type="text" placeholder="Username" required value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} style={{ padding: "12px", borderRadius: "5px", border: "1px solid #ccc" }} />
          <input type="password" placeholder="Password" required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} style={{ padding: "12px", borderRadius: "5px", border: "1px solid #ccc" }} />
          <button type="submit" style={{ padding: "12px", background: "#25D366", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}>{authMode === "login" ? "Login" : "Sign Up"}</button>
          <p style={{ textAlign: "center", fontSize: "13px", color: "#666", cursor: "pointer", margin: 0 }} onClick={() => {setAuthMode(authMode === "login" ? "register" : "login"); setAuthMessage({text:"", type:""});}}>
            {authMode === "login" ? "Need an account? Register here." : "Already have an account? Login."}
          </p>
        </form>
      )}

      {authMode === "authenticated" && (
        <div style={{ width: "1000px", height: "85vh", background: "white", display: "flex", borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }}>
          
          {/* LEFT PANE */}
          <div style={{ width: "35%", background: "white", borderRight: "1px solid #d1d7db", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#f0f2f5", padding: "15px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #d1d7db" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                 <div style={{ width: "40px", height: "40px", backgroundColor: "#075e54", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", color: "white", fontWeight: "bold" }}>
                   {loggedInUser.charAt(0).toUpperCase()}
                 </div>
                 <span style={{ fontWeight: "bold", color: "#111b21" }}>{loggedInUser}</span>
              </div>
              <button onClick={handleLogout} style={{ padding: "5px 10px", background: "transparent", color: "#d9534f", border: "1px solid #d9534f", borderRadius: "5px", cursor: "pointer", fontSize: "12px" }}>Log Out</button>
            </div>

            <div style={{ flexGrow: 1, overflowY: "auto" }}>
              {availableUsers.length === 0 ? (
                <p style={{ textAlign: "center", color: "#888", padding: "20px" }}>No other users registered.</p>
              ) : (
                availableUsers.map((user, index) => {
                  const isOnline = onlineUsers.includes(user);
                  const isSelected = chatTarget === user;
                  return (
                    <div 
                      key={index} 
                      onClick={() => startPrivateChat(user)}
                      style={{ padding: "15px 20px", display: "flex", alignItems: "center", gap: "15px", cursor: "pointer", borderBottom: "1px solid #f2f2f2", background: isSelected ? "#f0f2f5" : "white", transition: "background 0.2s" }}
                      onMouseOver={(e) => !isSelected && (e.currentTarget.style.background = "#f9f9f9")}
                      onMouseOut={(e) => !isSelected && (e.currentTarget.style.background = "white")}
                    >
                      <div style={{ position: "relative" }}>
                        <div style={{ width: "45px", height: "45px", backgroundColor: "#ccc", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", color: "#333", fontSize: "18px", fontWeight: "bold" }}>
                          {user.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ position: "absolute", bottom: "2px", right: "2px", width: "12px", height: "12px", borderRadius: "50%", border: "2px solid white", backgroundColor: isOnline ? "#25D366" : "#bbb" }}></div>
                      </div>
                      <div style={{ flexGrow: 1 }}>
                        <p style={{ margin: "0", fontWeight: "500", color: "#111b21", fontSize: "16px" }}>{user}</p>
                        <p style={{ margin: "0", fontSize: "13px", color: isOnline ? "#25D366" : "#888" }}>{isOnline ? "Online" : "Offline"}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANE */}
          <div style={{ width: "65%", display: "flex", flexDirection: "column", background: "#f0f2f5" }}>
            
            {!chatTarget ? (
              <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#667781" }}>
                <svg viewBox="0 0 24 24" width="80" height="80" fill="currentColor" style={{ opacity: 0.5, marginBottom: "20px" }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"></path></svg>
                <h2 style={{ fontWeight: "300", margin: 0 }}>Direct Messages</h2>
                <p style={{ marginTop: "10px", fontSize: "14px" }}>Select a contact from the list to start messaging.</p>
              </div>
            ) : (
              <>
                <div style={{ background: "#f0f2f5", padding: "10px 20px", display: "flex", alignItems: "center", borderBottom: "1px solid #d1d7db", minHeight: "60px", boxSizing: "border-box" }}>
                   <div style={{ width: "40px", height: "40px", backgroundColor: "#ccc", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", color: "#333", fontWeight: "bold", marginRight: "15px" }}>
                     {chatTarget.charAt(0).toUpperCase()}
                   </div>
                   <div>
                     <p style={{ margin: 0, fontWeight: "500", fontSize: "16px", color: "#111b21" }}>{chatTarget}</p>
                     {typingUser && <p style={{ margin: 0, fontSize: "12px", color: "#00a884" }}>typing...</p>}
                   </div>
                </div>
                
                <div className="whatsapp-bg chat-window" ref={chatWindowRef} onScroll={handleScroll} style={{ flexGrow: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column" }}>
                  {isLoadingOlder && <div style={{ textAlign: "center", padding: "10px", color: "#888", fontSize: "13px" }}>Loading older messages...</div>}
                  {messageList.map((msg, index) => {
                    const isMe = msg.author === loggedInUser;
                    return (
                      <div key={index} style={{ alignSelf: isMe ? "flex-end" : "flex-start", marginBottom: "10px", maxWidth: "70%", display: "flex", flexDirection: "column" }}>
                        <div style={{ backgroundColor: isMe ? "#dcf8c6" : "#ffffff", color: "#303030", padding: "8px 10px 8px 12px", borderRadius: "8px", borderTopRightRadius: isMe ? "0px" : "8px", borderTopLeftRadius: isMe ? "8px" : "0px", boxShadow: "0 1px 1px rgba(0,0,0,0.1)", wordBreak: "break-word" }}>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                            <span style={{ fontSize: "14.5px" }}>{msg.message}</span>
                            <span style={{ fontSize: "10px", color: "#999", position: "relative", bottom: "-3px", float: "right" }}>{msg.time}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typingUser && <div className="typing-bubble"><span></span><span></span><span></span></div>}
                </div>

                <div style={{ background: "#f0f0f0", padding: "10px 20px", display: "flex", gap: "10px", alignItems: "center" }}>
                  <input style={{ flexGrow: 1, padding: "12px 20px", border: "none", borderRadius: "30px", fontSize: "15px", outline: "none" }} type="text" value={currentMessage} placeholder="Type a message" onChange={handleTyping} onKeyPress={(e) => e.key === "Enter" && sendMessage()} />
                  <button onClick={sendMessage} style={{ width: "45px", height: "45px", borderRadius: "50%", background: "#00a884", color: "white", border: "none", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;