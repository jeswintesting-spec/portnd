# Portnd - Peer-to-Peer File & Chat Sharing

Portnd is a premium, secure, and blazingly fast P2P sharing application built on WebRTC. It allows you to beam files and messages directly between devices without ever touching a server. No accounts, no uploads, just pure direct sharing.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Web-orange.svg)

---

## ✨ Features

- **🚀 P2P File Transfer:** Direct device-to-device sharing using WebRTC Data Channels.
- **⚡ Adaptive Speed:** Automatically detects Local Network vs. Internet connections to optimize transfer speed.
- **📦 Large File Support:** Robust flow-control (backpressure) handling for multi-gigabyte files.
- **💬 Real-time Chat:** Built-in messaging system to communicate and share links/text while you transfer.
- **📸 QR Code Pairing:** Generate and scan QR codes for instant mobile-to-desktop pairing.
- **🔗 Smart Linkify:** Automatically detects and linkifies URLs, emails, and phone numbers in chat.
- **🛡️ Privacy First:** Zero data storage. Your files and messages never touch a server.
- **🎨 Premium UI:** Beautiful "Glassmorphic" design with smooth transitions and a responsive layout.

---

## 🛠️ Technology Stack

- **Framework:** [React](https://reactjs.org/) (Powered by Vite)
- **P2P Networking:** [PeerJS](https://peerjs.com/) (WebRTC)
- **Icons:** [Lucide React](https://lucide.dev/)
- **QR Logic:** [qrcode](https://www.npmjs.com/package/qrcode) & [jsQR](https://www.npmjs.com/package/jsqr)
- **Styling:** Vanilla CSS3 (Modern variables, Flexbox, and Glassmorphism)

---

## 🧠 How it Works

Portnd establishes a direct tunnel between two browsers using **WebRTC**:
1. **Signaling:** A 6-character unique ID is generated to identify your device.
2. **ICE Discovery:** The app uses STUN/TURN servers to find a path through complex firewalls and NATs.
3. **Binary Data Channel:** A secure, binary-friendly channel is opened for file chunks and JSON messages.
4. **Chunking Engine:** Files are sliced into optimal chunks based on your connection type (Local vs. Internet) to ensure maximum throughput without crashing the browser.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/portnd.git
   ```
2. Navigate to the client directory:
   ```bash
   cd client
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🔒 Security & Privacy

- **End-to-End Encrypted:** All data is encrypted using WebRTC's native DTLS (Datagram Transport Layer Security).
- **Direct P2P:** No intermediary server stores your data. Files move directly from Device A to Device B.
- **Local Network Support:** If both devices are on the same Wi-Fi, data stays within your local network and never touches the public internet.

---

## 📄 License

This project is licensed under the **MIT License**. You are free to use, modify, and distribute it for personal or commercial projects.

---

*Developed with ❤️ by **jsk***
