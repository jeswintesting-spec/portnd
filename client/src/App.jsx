import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';
import QRCode from 'qrcode';
import { UploadCloud, Download, X, Check, File as FileIcon, Copy, Wifi, Globe, Clock, ArrowUpRight, ArrowDownLeft, Trash2, AlertCircle, RefreshCw, Send, Plus, QrCode, Sun, Moon, Signal, ChevronLeft, MessageCircle, Share2 } from 'lucide-react';
import QrScanner from './components/QrScanner';

const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const safeLocalStorage = (() => {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (e) {
    const mockStorage = {};
    return {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, value) => { mockStorage[key] = String(value); },
      removeItem: (key) => { delete mockStorage[key]; },
      clear: () => { for (const key in mockStorage) delete mockStorage[key]; }
    };
  }
})();

// Adaptive transfer profiles (Optimized for ultra-high P2P speeds)
const TRANSFER_PROFILES = {
  local: {
    chunkSize: 220 * 1024,       // 220 KB — Optimal safe size to prevent WebRTC congestion
    bufferHigh: 16 * 1024 * 1024, // 16 MB — Large buffer window to keep the network pipe saturated
    bufferLow: 4 * 1024 * 1024,  // 4 MB  
  },
  internet: {
    chunkSize: 220 * 1024,       // 220 KB — High speed internet throughput
    bufferHigh: 8 * 1024 * 1024,  // 8 MB  
    bufferLow: 2 * 1024 * 1024,  // 2 MB  
  },
};


const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

const PEERJS_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  pingInterval: 5000,
  debug: 1,
  config: {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan'
  }
};
const CONNECTION_TIMEOUT_MS = 30000; // 30s — some slow networks need more time

function generateShortId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateName() {
  const adjectives = ['Swift', 'Silent', 'Clever', 'Brave', 'Mighty', 'Cool', 'Epic'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear'];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

function getDeviceType() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Web Device";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function calculateSpeedAndRemaining(state) {
  if (!state || !state.size || !state.startTime) return null;
  const elapsed = (Date.now() - state.startTime) / 1000; // seconds
  if (elapsed <= 0.1) return { speed: '0 B/s', remaining: '--' };

  const transferred = state.size * (state.progress / 100);
  const speedBytesPerSec = transferred / elapsed;

  // Format speed
  let speedStr = '';
  if (speedBytesPerSec > 1024 * 1024) {
    speedStr = `${(speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  } else if (speedBytesPerSec > 1024) {
    speedStr = `${(speedBytesPerSec / 1024).toFixed(1)} KB/s`;
  } else {
    speedStr = `${Math.round(speedBytesPerSec)} B/s`;
  }

  // Format remaining time
  const remainingBytes = state.size - transferred;
  let remainingStr = '--';
  if (speedBytesPerSec > 0 && state.progress < 100) {
    const remainingSecs = remainingBytes / speedBytesPerSec;
    if (remainingSecs > 60) {
      remainingStr = `${Math.floor(remainingSecs / 60)}m ${Math.round(remainingSecs % 60)}s remaining`;
    } else {
      remainingStr = `${Math.round(remainingSecs)}s remaining`;
    }
  } else if (state.progress === 100) {
    remainingStr = 'Completed';
  }

  return { speed: speedStr, remaining: remainingStr };
}

function LinkifyText({ text }) {
  const urlPattern = /https?:\/\/[^\s]+/i;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
  const phonePattern = /\+?\d{1,3}[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4,5}/;

  const combinedPattern = new RegExp(`(${urlPattern.source}|${emailPattern.source}|${phonePattern.source})`, 'gi');
  const parts = text.split(combinedPattern);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.match(/^https?:\/\/[^\s]+$/i)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="chat-link">{part}</a>;
    }
    if (part.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i)) {
      return <a key={i} href={`mailto:${part}`} className="chat-link">{part}</a>;
    }
    if (part.match(/^\+?\d{1,3}[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4,5}$/)) {
      return <a key={i} href={`tel:${part.replace(/[^\d+]/g, '')}`} className="chat-link">{part}</a>;
    }
    return part;
  });
}


function App() {
  const [myId, setMyId] = useState('');
  const [myName] = useState(generateName());
  const [peerInstance, setPeerInstance] = useState(null);
  const [peerError, setPeerError] = useState(null);
  const [connectedPeerId, setConnectedPeerId] = useState(null);
  const [connectedPeerName, setConnectedPeerName] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [connectionType, setConnectionType] = useState(null);
  const [connectionQuality, setConnectionQuality] = useState(null); // 'excellent' | 'good' | 'fair' | 'poor'
  const [connectError, setConnectError] = useState(null);
  const [targetInput, setTargetInput] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransferMinimized, setIsTransferMinimized] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const lastProgressUpdateRef = useRef(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [waitingForAccept, setWaitingForAccept] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState(null); // { name, device, peerId }

  // Chat / Messaging
  const [clipboardText, setClipboardText] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('files'); // 'files' or 'chat' for mobile view
  const [isChatDragging, setIsChatDragging] = useState(false);
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const isTypingSentRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  const connectionTypeRef = useRef(null); // kept in sync for use inside async closures

  // Multi-file queue (sender side)
  const [fileQueue, setFileQueue] = useState([]); // [{name, size, type}] for display

  // Incoming batch (receiver side)
  const [incomingBatch, setIncomingBatch] = useState(null); // {files, totalSize}

  // Transfer progress
  const [transferState, setTransferState] = useState(null); // {status, name, progress, fileIndex, totalFiles}

  const [transferHistory, setTransferHistory] = useState(() => {
    try {
      const saved = safeLocalStorage.getItem('portnd_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Refs
  const connectionRef = useRef(null);
  const fileQueueRef = useRef([]);         // actual File objects (sender)
  const currentSendIndexRef = useRef(0);
  const batchMetaRef = useRef([]);         // received file metas (receiver)
  const currentReceiveIndexRef = useRef(0);
  const receiveBufferRef = useRef([]);
  const receivedSizeRef = useRef(0);
  const fileInputRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const peerRef = useRef(null);
  const connectedPeerNameRef = useRef(null);
  const connectedPeerIdRef = useRef(null);
  const cancelTransferRef = useRef(false);
  const autoConnectCodeRef = useRef(null); // code from QR scan — auto-connect when peer opens
  const chatEndRef = useRef(null); // for auto-scroll to bottom
  const chatTextareaRef = useRef(null);

  // Streaming Refs (Zero-RAM)
  const activeWriterRef = useRef(null);
  const streamIdRef = useRef(null);
  const activeStreamWindowRef = useRef(null);

  const addHistory = useCallback((type, name, size, peerName) => {
    const newEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type,
      name,
      size,
      peerName: peerName || 'Unknown',
      timestamp: Date.now()
    };
    setTransferHistory(prev => {
      const updated = [newEntry, ...prev].slice(0, 50);
      safeLocalStorage.setItem('portnd_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setTransferHistory([]);
    safeLocalStorage.removeItem('portnd_history');
  }, []);

  // Keep refs in sync with state for use inside closures
  useEffect(() => { connectedPeerNameRef.current = connectedPeerName; }, [connectedPeerName]);
  useEffect(() => { connectedPeerIdRef.current = connectedPeerId; }, [connectedPeerId]);
  useEffect(() => { connectionTypeRef.current = connectionType; }, [connectionType]);

  // Generate QR code whenever myId is assigned
  useEffect(() => {
    if (!myId) return;
    const url = `${window.location.origin}${window.location.pathname}?code=${myId}`;
    QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then(setQrDataUrl).catch(console.error);
  }, [myId]);

  // Auto-fill connect input from URL ?code= param (set by QR scan)
  // Also stores code in ref so we can auto-connect as soon as the peer is ready
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) {
      const upper = code.toUpperCase();
      setTargetInput(upper);
      autoConnectCodeRef.current = upper; // trigger auto-connect in peer.on('open')
      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Auto-scroll chat to bottom
  const chatMessagesRef = useRef(null);
  useEffect(() => {
    const isDesktop = window.innerWidth >= 1024;
    if ((activeTab === 'chat' || isDesktop) && chatMessagesRef.current) {
      const timeout = setTimeout(() => {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [messages, activeTab]);

  // Heartbeat to detect dead connections (especially on mobile)
  useEffect(() => {
    let interval;
    if (connectionRef.current && connectionState === 'connected') {
      interval = setInterval(() => {
        if (connectionRef.current && connectionRef.current.open) {
          try {
            // Heartbeat (Manual Packet: 0x00 = JSON)
            const json = JSON.stringify({ type: 'ping' });
            const data = new TextEncoder().encode(json);
            const packet = new Uint8Array(1 + data.length);
            packet[0] = 0;
            packet.set(data, 1);
            connectionRef.current.send(packet);
          } catch (e) {
            disconnect();
          }
        } else {
          disconnect();
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [connectionState]);

  // Lock body/html scroll and handle visual viewport resizing dynamically (for mobile keyboards)
  useEffect(() => {
    if (connectionState !== 'connected') {
      document.body.classList.remove('body-state-connected');
      document.documentElement.classList.remove('body-state-connected');
      return;
    }

    document.body.classList.add('body-state-connected');
    document.documentElement.classList.add('body-state-connected');

    const updateViewportHeight = () => {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--viewport-height', `${height}px`);

      // Snaps layout to top immediately if anything scrolled (checks window scroll, body scroll, and html scroll)
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    };

    updateViewportHeight();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportHeight);
      vv.addEventListener('scroll', updateViewportHeight);
    } else {
      window.addEventListener('resize', updateViewportHeight);
    }

    // Intercept any scroll event on the main window/body and instantly override it to 0
    const handleGlobalScroll = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    };
    window.addEventListener('scroll', handleGlobalScroll, { passive: true });

    // Focus triggers: keep checking viewport layout and resetting window scroll offsets
    const handleFocus = () => {
      // Multiple checks to capture the keyboard opening animation stages
      updateViewportHeight();
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      setTimeout(updateViewportHeight, 50);
      setTimeout(updateViewportHeight, 150);
      setTimeout(updateViewportHeight, 300);
    };
    window.addEventListener('focusin', handleFocus);

    return () => {
      document.body.classList.remove('body-state-connected');
      document.documentElement.classList.remove('body-state-connected');
      if (vv) {
        vv.removeEventListener('resize', updateViewportHeight);
        vv.removeEventListener('scroll', updateViewportHeight);
      } else {
        window.removeEventListener('resize', updateViewportHeight);
      }
      window.removeEventListener('scroll', handleGlobalScroll);
      window.removeEventListener('focusin', handleFocus);
    };
  }, [connectionState]);

  const prepareWriterForFile = useCallback(async (meta) => {
    receiveBufferRef.current = []; // Clear fallback buffer

    // 0. Try Flutter native storage handler
    if (window.FlutterDownloadChannel) {
      try {
        window.FlutterDownloadChannel.postMessage(JSON.stringify({
          type: 'start',
          name: meta.name,
          size: meta.size
        }));

        activeWriterRef.current = {
          write: (chunk) => {
            let binary = '';
            const len = chunk.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(chunk[i]);
            }
            const base64 = window.btoa(binary);
            window.FlutterDownloadChannel.postMessage(JSON.stringify({
              type: 'chunk',
              data: base64
            }));
          },
          close: () => {
            window.FlutterDownloadChannel.postMessage(JSON.stringify({
              type: 'end'
            }));
          }
        };
        return true;
      } catch (e) {
        console.error("Flutter download channel start failed:", e);
      }
    }

    // 1. Try FileSystem Access API (Desktop Chrome/Edge)
    if ('showSaveFilePicker' in window && !isMobileDevice) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: meta.name,
          types: [{ accept: { [meta.type || 'application/octet-stream']: [] } }]
        });
        activeWriterRef.current = await handle.createWritable();
        return true;
      } catch (e) {
        console.warn("FileSystem Access denied or failed, falling back to StreamSaver", e);
      }
    }

    // 2. Fallback to Service Worker Streaming (Safari/iOS/Firefox)
    if ('serviceWorker' in navigator) {
      // Ensure we have a controller. If not, we might be on first load.
      if (!navigator.serviceWorker.controller) {
        console.warn("Service Worker registered but not controlling. Waiting for ready...");
        const reg = await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          console.error("Still no SW controller. Falling back to RAM.");
          return false;
        }
      }

      const streamId = Math.random().toString(36).substring(2);
      streamIdRef.current = streamId;

      const channel = new MessageChannel();

      // Use a promise to wait for SW acknowledgement
      const opened = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          if (event.data.status === 'OPENED') resolve(true);
          else resolve(false);
        };
        navigator.serviceWorker.controller.postMessage({
          type: 'STREAM_OPEN',
          streamId,
          filename: meta.name,
          size: meta.size,
          type: meta.type
        }, [channel.port2]);
      });

      if (!opened) {
        console.error("Failed to open stream in Service Worker");
        return false;
      }

      const downloadUrl = `/download-stream?id=${streamId}`;
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.src = downloadUrl;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 30000);

      activeWriterRef.current = {
        write: (chunk) => {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'STREAM_CHUNK',
              streamId,
              chunk
            });
          }
        },
        close: () => {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'STREAM_CLOSE',
              streamId
            });
          }
        }
      };
      return true;
    }

    // 3. Ultimate fallback: Use RAM (default behavior)
    console.warn("Streaming not supported, falling back to RAM (large files may fail)");
    return false;
  }, []);

  const sendFileAtIndex = useCallback(async (conn, index) => {
    const files = fileQueueRef.current;
    if (index >= files.length) {
      setTransferState(null);
      setFileQueue([]);
      fileQueueRef.current = [];
      currentSendIndexRef.current = 0;
      return;
    }

    const file = files[index];
    if (index === 0) setIsTransferMinimized(false);
    setTransferState({
      status: 'sending',
      name: file.name,
      size: file.size,
      progress: 0,
      fileIndex: index + 1,
      totalFiles: files.length,
      startTime: Date.now()
    });

    // Pick transfer profile; cap chunkSize to DataChannel's reported max
    const profile = {
      ...(connectionTypeRef.current === 'local'
        ? TRANSFER_PROFILES.local
        : TRANSFER_PROFILES.internet)
    };

    // Safety: respect browser's DataChannel maxMessageSize (minus 1 byte header)
    const dc = conn.dataChannel;
    if (dc && dc.maxMessageSize && dc.maxMessageSize > 0) {
      profile.chunkSize = Math.min(profile.chunkSize, dc.maxMessageSize - 1);
    }

    if (dc) {
      dc.bufferedAmountLowThreshold = profile.bufferLow;
    }

    const waitForDrain = () => new Promise(resolve => {
      if (!dc) { resolve(); return; }
      dc.addEventListener('bufferedamountlow', resolve, { once: true });
    });

    const sendJson = (payload) => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      conn.send(packet);
    };

    try {
      cancelTransferRef.current = false; // reset flag at start of each file
      let offset = 0;
      // Prefetch the first chunk immediately
      let nextBufPromise = file.slice(0, Math.min(profile.chunkSize, file.size)).arrayBuffer();

      while (offset < file.size) {
        // Flow control: pause if the DataChannel buffer is too full
        if (dc && dc.bufferedAmount > profile.bufferHigh) {
          await waitForDrain();
        }

        const buffer = await nextBufPromise;
        const nextOffset = offset + buffer.byteLength;

        if (nextOffset < file.size) {
          const end = Math.min(nextOffset + profile.chunkSize, file.size);
          nextBufPromise = file.slice(nextOffset, end).arrayBuffer();
        }

        // Abort if cancelled
        if (cancelTransferRef.current) {
          sendJson({ type: 'cancel' });
          setTransferState(null);
          fileQueueRef.current = [];
          setFileQueue([]);
          return;
        }

        // Send binary packet (Header 1)
        const chunk = new Uint8Array(buffer);
        const packet = new Uint8Array(1 + chunk.length);
        packet[0] = 1;
        packet.set(chunk, 1);
        conn.send(packet);

        offset = nextOffset;

        const p = Math.round((offset / file.size) * 100);
        setTransferState(prev => prev ? { ...prev, progress: Math.min(p, 100) } : prev);
      }

      // VITAL: Wait until the DataChannel buffer is completely empty (actually flushed)
      while (dc && dc.bufferedAmount > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      sendJson({
        type: 'transferComplete',
        expectedSize: file.size
      });

      addHistory('sent', file.name, file.size, connectedPeerNameRef.current || connectedPeerIdRef.current);
      setTimeout(() => sendFileAtIndex(conn, index + 1), 300);
    } catch (err) {
      console.error('Send error:', err);
      setConnectError('Transfer failed: ' + err.message);
      setTransferState(null);
    }
  }, [addHistory]);

  const saveReceivedFile = useCallback(async () => {
    const idx = currentReceiveIndexRef.current;
    const meta = batchMetaRef.current[idx];
    if (!meta) return;

    // Close the writer/stream
    if (activeWriterRef.current) {
      try {
        await activeWriterRef.current.close();
      } catch (e) { console.error("Error closing writer:", e); }
      activeWriterRef.current = null;
    }

    // If we used the Service Worker stream, we notify it to close
    if (streamIdRef.current && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STREAM_CLOSE',
        streamId: streamIdRef.current
      });
      streamIdRef.current = null;
    }

    // Fallback logic for small files or if streaming wasn't used (already handled if writer exists)
    if (receiveBufferRef.current.length > 0) {
      const blob = new Blob(receiveBufferRef.current, { type: meta.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }

    addHistory('received', meta.name, meta.size, connectedPeerNameRef.current || connectedPeerIdRef.current);

    currentReceiveIndexRef.current = idx + 1;
    const nextIdx = currentReceiveIndexRef.current;

    if (nextIdx < batchMetaRef.current.length) {
      receiveBufferRef.current = [];
      receivedSizeRef.current = 0;

      // Prepare next stream if batching
      const nextMeta = batchMetaRef.current[nextIdx];
      await prepareWriterForFile(nextMeta);

      setTransferState({
        status: 'receiving',
        name: nextMeta.name,
        size: nextMeta.size,
        progress: 0,
        fileIndex: nextIdx + 1,
        totalFiles: batchMetaRef.current.length,
        startTime: Date.now()
      });
    } else {
      setTransferState(prev => prev ? { ...prev, progress: 100, status: 'complete' } : prev);
      setTimeout(() => {
        setTransferState(null);
        batchMetaRef.current = [];
        currentReceiveIndexRef.current = 0;
      }, 1500);
    }
  }, [addHistory, prepareWriterForFile]);

  const setupConnection = useCallback((conn, isIncoming) => {
    connectionRef.current = conn;
    setConnectedPeerId(conn.peer);
    setConnectError(null);
    setMessages([]);
    setActiveTab('files');
    if (conn.dataChannel) {
      conn.dataChannel.binaryType = 'arraybuffer';
    }

    conn.isIncomingConnection = isIncoming;

    // Handshake
    const sendJson = (payload) => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      conn.send(packet);
    };

    if (!isIncoming) {
      sendJson({ type: 'hello', name: myName, device: getDeviceType() });
    }

    statsIntervalRef.current = setInterval(async () => {
      if (!conn.peerConnection) return;
      try {
        const stats = await conn.peerConnection.getStats();
        let activePair = null;
        let rtt = null;
        let packetsLost = 0;
        let packetsSent = 0;

        stats.forEach(r => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.bytesSent > 0)) {
            activePair = r;
          }
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            packetsLost = r.packetsLost || 0;
            packetsSent = r.packetsReceived || 0;
          }
          if (r.type === 'candidate-pair' && r.currentRoundTripTime) {
            rtt = r.currentRoundTripTime * 1000;
          }
        });

        if (activePair) {
          const lc = stats.get(activePair.localCandidateId);
          const type = lc && lc.candidateType === 'host' ? 'local' : 'internet';
          setConnectionType(type);
          connectionTypeRef.current = type;

          let quality = 'good';
          if (rtt !== null) {
            if (rtt < 50 && packetsLost < 5) {
              quality = 'excellent';
            } else if (rtt < 150 && packetsLost < 10) {
              quality = 'good';
            } else if (rtt < 300 && packetsLost < 20) {
              quality = 'fair';
            } else {
              quality = 'poor';
            }
          } else if (packetsSent > 0) {
            const lossRate = (packetsLost / (packetsLost + packetsSent)) * 100;
            if (lossRate < 1) quality = 'excellent';
            else if (lossRate < 3) quality = 'good';
            else if (lossRate < 10) quality = 'fair';
            else quality = 'poor';
          }
          setConnectionQuality(quality);
        }
      } catch (e) { /* ignore */ }
    }, 2000);

    const processMessage = (msg, chunk) => {
      if (!msg) return;
      if (msg.type === 'ping') return;
      if (msg.type === 'hello') {
        if (conn.isIncomingConnection) {
          setIncomingRequest({
            name: msg.name,
            device: msg.device || 'Unknown Device',
            peerId: conn.peer
          });
        } else {
          setConnectedPeerName(msg.name);
          connectedPeerNameRef.current = msg.name;
          setConnectionState('connected');
          setActiveTab('files');
        }
      }
      else if (msg.type === 'acceptConnection') {
        setConnectedPeerName(msg.name);
        connectedPeerNameRef.current = msg.name;
        setConnectionState('connected');
        setActiveTab('files');
      }
      else if (msg.type === 'declineConnection') {
        setConnectError('Connection request was declined by the other device.');
        disconnect();
      }
      else if (msg.type === 'fileBatch') {
        const totalSize = msg.files.reduce((s, f) => s + f.size, 0);
        batchMetaRef.current = msg.files;
        currentReceiveIndexRef.current = 0;
        setIncomingBatch({ files: msg.files, totalSize });
      }
      else if (msg.type === 'accept') {
        setWaitingForAccept(false);
        currentSendIndexRef.current = 0;
        sendFileAtIndex(conn, 0);
      }
      else if (msg.type === 'reject') {
        setWaitingForAccept(false);
        setConnectError('The other device declined the file transfer.');
        setTransferState(null);
        fileQueueRef.current = [];
        setFileQueue([]);
        currentSendIndexRef.current = 0;
      }
      else if (msg.type === 'cancel') {
        cancelTransferRef.current = true;
        setWaitingForAccept(false);
        setTransferState(null);
        receiveBufferRef.current = [];
        receivedSizeRef.current = 0;
        batchMetaRef.current = [];
        currentReceiveIndexRef.current = 0;
        fileQueueRef.current = [];
        setFileQueue([]);
        setConnectError('Transfer was cancelled by the other device.');
      }
      else if (msg.type === 'fileChunk') {
        if (!batchMetaRef.current.length || !chunk) return;

        if (activeWriterRef.current) {
          activeWriterRef.current.write(chunk);
        } else {
          receiveBufferRef.current.push(chunk);
        }
        receivedSizeRef.current += chunk.byteLength;

        const now = Date.now();
        if (now - lastProgressUpdateRef.current > 150) {
          const currentMeta = batchMetaRef.current[currentReceiveIndexRef.current];
          const p = Math.round((receivedSizeRef.current / currentMeta.size) * 100);
          setTransferState(prev => ({ ...prev, progress: Math.min(p, 100) }));
          lastProgressUpdateRef.current = now;
        }
      }
      else if (msg.type === 'transferComplete') {
        saveReceivedFile();
      }
      else if (msg.type === 'typing') {
        setPeerIsTyping(msg.isTyping);
      }
      else if (msg.type === 'text') {
        setPeerIsTyping(false);
        setMessages(prev => [...prev, {
          text: msg.payload,
          sender: 'peer',
          time: Date.now(),
          replyTo: msg.replyTo
        }]);
      }
    };

    conn.on('data', (data) => {
      if (!data) return;

      const handleData = async () => {
        let rawData = data;
        if (data instanceof Blob) {
          rawData = await data.arrayBuffer();
        }

        let msg;
        let chunk = null;

        try {
          const packet = new Uint8Array(rawData);
          if (packet[0] === 0) {
            // JSON message
            msg = JSON.parse(new TextDecoder().decode(packet.slice(1)));
          } else if (packet[0] === 1) {
            // Binary chunk
            msg = { type: 'fileChunk' };
            chunk = packet.slice(1);
          } else {
            return; // Unknown packet type
          }
        } catch (e) {
          console.error("Protocol error:", e);
          return;
        }

        processMessage(msg, chunk);
      };

      handleData();
    });

    conn.on('close', () => {
      setConnectionState('disconnected');
      setConnectedPeerId(null);
      setConnectedPeerName(null);
      setConnectionType(null);
      setConnectionQuality(null);
      setMessages([]);
      connectionRef.current = null;
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      setIncomingRequest(null);
    });

    conn.on('error', (err) => {
      console.error('Data channel error:', err);
      setConnectError('Connection lost unexpectedly.');
      disconnect();
    });

    // Monitor for silent WebRTC ICE failures
    const iceCheckInterval = setInterval(() => {
      if (conn.peerConnection && (conn.peerConnection.iceConnectionState === 'failed' || conn.peerConnection.iceConnectionState === 'disconnected')) {
        console.warn('ICE connection failed, disconnecting...');
        disconnect();
      }
    }, 4000);

    return () => clearInterval(iceCheckInterval);
  }, [myName, saveReceivedFile, sendFileAtIndex]);

  const initPeer = useCallback(() => {
    let id = safeLocalStorage.getItem('portnd_my_id');
    if (!id) {
      id = generateShortId();
      safeLocalStorage.setItem('portnd_my_id', id);
    }

    setPeerError(null);
    setMyId('');

    const peer = new Peer(id, PEERJS_CONFIG);
    peerRef.current = peer;

    peer.on('open', (openId) => {
      setMyId(openId);
      setPeerError(null);
      // Auto-connect if page was opened via QR scan
      if (autoConnectCodeRef.current && autoConnectCodeRef.current !== openId) {
        const code = autoConnectCodeRef.current;
        autoConnectCodeRef.current = null; // consume once
        setConnectionState('connecting');
        setConnectError(null);
        const conn = peer.connect(code, { reliable: true, serialization: 'binary' });
        connectionTimeoutRef.current = setTimeout(() => {
          if (!conn.open) {
            conn.close();
            setConnectionState('disconnected');
            setConnectError('Auto-connect timed out. The other device may not be ready yet — try connecting manually.');
          }
        }, CONNECTION_TIMEOUT_MS);
        conn.on('open', () => {
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
          setupConnection(conn);
        });
        conn.on('error', (err) => {
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
          console.error('Auto-connect error:', err);
          setConnectionState('disconnected');
          setConnectError('Failed to auto-connect. Try connecting manually using the code.');
        });
      }
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err.type, err);
      if (err.type === 'network') {
        setPeerError('Network error: Unable to connect to signaling server.');
      } else if (err.type === 'socket-error') {
        setPeerError('Signaling socket error. Try refreshing.');
      } else if (err.type === 'socket-closed') {
        setPeerError('Signaling connection closed unexpectedly.');
      } else if (err.type === 'server-error') {
        setPeerError('PeerJS cloud server error. Please try again later.');
      } else if (err.type === 'unavailable-id') {
        safeLocalStorage.removeItem('portnd_my_id'); // Clear taken ID
        peer.destroy();
        initPeer(); // Regenerate and save new ID
      } else if (err.type === 'peer-unavailable') {
        setConnectError('Peer not found. Make sure the code is correct and the other device is online.');
        setConnectionState('disconnected');
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      } else {
        setConnectError(`Connection error: ${err.type}`);
        setConnectionState('disconnected');
      }
    });

    peer.on('connection', (conn) => {
      setConnectionState('connecting');
      setConnectError(null);
      if (conn.open) setupConnection(conn, true);
      else conn.on('open', () => setupConnection(conn, true));
      conn.on('error', (err) => {
        console.error('Incoming connection error:', err);
        setConnectionState('disconnected');
        setConnectError('Connection failed unexpectedly.');
      });
    });

    peer.on('disconnected', () => {
      // Automatic reconnection with a small delay to avoid loops
      if (!peer.destroyed) {
        setTimeout(() => {
          if (!peer.destroyed && peer.disconnected) peer.reconnect();
        }, 3000);
      }
    });

    setPeerInstance(peer);
    return peer;
  }, [setupConnection]);

  useEffect(() => {
    const peer = initPeer();
    return () => {
      peer.destroy();
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    };
  }, [initPeer]);

  const connectToPeer = async (overrideCode) => {
    const codeToConnect = typeof overrideCode === 'string' ? overrideCode : targetInput;
    if (!codeToConnect || !peerInstance) return;
    if (codeToConnect.toUpperCase() === myId.toUpperCase()) { setConnectError('You cannot connect to yourself!'); return; }

    setConnectionState('connecting');
    setConnectError(null);

    const conn = peerInstance.connect(codeToConnect.toUpperCase(), { reliable: true, serialization: 'binary' });

    connectionTimeoutRef.current = setTimeout(() => {
      if (!conn.open) {
        conn.close();
        setConnectionState('disconnected');
        setConnectError('Could not connect (30s timeout). Tips: ① Ask the other person to type YOUR code and connect to you instead. ② Make sure both devices are online. ③ Try switching from Wi-Fi to mobile data or vice versa.');
      }
    }, CONNECTION_TIMEOUT_MS);

    conn.on('open', () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      setupConnection(conn, false);
    });

    conn.on('error', (err) => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      console.error('Outgoing connection error:', err);
      setConnectionState('disconnected');
      setConnectError('Failed to connect. Make sure the code is correct and the other person is online.');
    });
  };

  const addFilesToQueue = (files) => {
    const newFiles = [...fileQueueRef.current, ...Array.from(files)];
    fileQueueRef.current = newFiles;
    setFileQueue(newFiles.map(f => ({ name: f.name, size: f.size, type: f.type })));
  };

  const removeFromQueue = (index) => {
    const newFiles = fileQueueRef.current.filter((_, i) => i !== index);
    fileQueueRef.current = newFiles;
    setFileQueue(newFiles.map(f => ({ name: f.name, size: f.size, type: f.type })));
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length) addFilesToQueue(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
  };

  const sendBatch = () => {
    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };
    if (!fileQueueRef.current.length || !connectionRef.current) return;
    const files = fileQueueRef.current.map(f => ({ name: f.name, size: f.size, type: f.type }));
    sendJson({ type: 'fileBatch', files });
    setWaitingForAccept(true);
  };

  const handleTyping = (text) => {
    if (!connectionRef.current) return;
    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };

    if (text.trim().length > 0) {
      if (!isTypingSentRef.current) {
        isTypingSentRef.current = true;
        sendJson({ type: 'typing', isTyping: true });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingSentRef.current = false;
        sendJson({ type: 'typing', isTyping: false });
      }, 1500);
    } else {
      if (isTypingSentRef.current) {
        isTypingSentRef.current = false;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        sendJson({ type: 'typing', isTyping: false });
      }
    }
  };

  const sendText = () => {
    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };
    if (!clipboardText.trim() || !connectionRef.current) return;
    sendJson({
      type: 'text',
      payload: clipboardText,
      replyTo: replyingTo
    });

    // Clear typing indicator instantly
    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendJson({ type: 'typing', isTyping: false });
    }

    setMessages(prev => [...prev, {
      text: clipboardText,
      sender: 'me',
      time: Date.now(),
      replyTo: replyingTo
    }]);
    setClipboardText('');
    setReplyingTo(null);
    setTimeout(() => {
      if (chatTextareaRef.current) {
        chatTextareaRef.current.focus();
      }
    }, 0);
  };

  const acceptBatch = async () => {
    if (!incomingBatch || !connectionRef.current) return;

    currentReceiveIndexRef.current = 0;
    receiveBufferRef.current = [];
    receivedSizeRef.current = 0;

    const firstMeta = batchMetaRef.current[0];

    // Immediately remove accept prompt and show preparing state
    setIncomingBatch(null);
    setIsTransferMinimized(false);

    setTransferState({
      status: 'receiving',
      name: firstMeta?.name || '',
      size: firstMeta?.size || 0,
      progress: -1, // -1 means preparing
      fileIndex: 1,
      totalFiles: batchMetaRef.current.length,
      startTime: Date.now()
    });

    // Prepare streaming for the first file (might take time if prompting user)
    const usingStream = await prepareWriterForFile(firstMeta);

    setTimeout(() => {
      setTransferState(prev => prev ? { ...prev, progress: 0 } : prev);
    }, 500);

    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };
    sendJson({ type: 'accept' });
  };

  const rejectBatch = () => {
    if (!incomingBatch || !connectionRef.current) return;
    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };
    sendJson({ type: 'reject' });
    setIncomingBatch(null);
    batchMetaRef.current = [];
  };

  const cancelTransfer = () => {
    cancelTransferRef.current = true;
    const sendJson = (payload) => {
      if (!connectionRef.current) return;
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };
    // For receiver: notify sender and clean up
    sendJson({ type: 'cancel' });
    setTransferState(null);
    receiveBufferRef.current = [];
    receivedSizeRef.current = 0;
    batchMetaRef.current = [];
    currentReceiveIndexRef.current = 0;
    fileQueueRef.current = [];
    setFileQueue([]);
  };

  const resetMyId = () => {
    safeLocalStorage.removeItem('portnd_my_id');
    if (peerRef.current) peerRef.current.destroy();
    initPeer();
  };

  const disconnect = () => { if (connectionRef.current) connectionRef.current.close(); };

  const acceptConnection = () => {
    if (!incomingRequest || !connectionRef.current) return;
    const sendJson = (payload) => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };

    sendJson({ type: 'acceptConnection', name: myName, device: getDeviceType() });
    setConnectedPeerName(incomingRequest.name);
    setConnectionState('connected');
    setActiveTab('files');
    setIncomingRequest(null);
  };

  const rejectConnection = () => {
    if (!incomingRequest || !connectionRef.current) return;
    const sendJson = (payload) => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const packet = new Uint8Array(1 + data.length);
      packet[0] = 0;
      packet.set(data, 1);
      connectionRef.current.send(packet);
    };

    try {
      sendJson({ type: 'declineConnection' });
    } catch (e) { /* ignore */ }
    
    disconnect();
    setIncomingRequest(null);
  };

  const copyToClipboard = () => navigator.clipboard.writeText(myId);

  const shareConnectionLink = () => {
    if (!myId) return;
    const url = `${window.location.origin}${window.location.pathname}?code=${myId}`;
    const shareData = {
      title: 'Portnd P2P Sharing',
      text: `Connect to me on Portnd to share files:`,
      url: url
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard! Share it with your friend to connect.');
    }
  };

  const totalQueueSize = fileQueue.reduce((s, f) => s + f.size, 0);

  return (
    <div className={`app-container ${isDarkMode ? 'dark' : 'light'} state-${connectionState} active-tab-${activeTab}`}>
      <style>{`
        .chat-bubble { 
          width: fit-content !important; 
          height: auto !important; 
          min-height: 0 !important;
          max-width: 85% !important;
          padding: 6px 12px !important;
          display: inline-block !important;
          line-height: 1.2 !important;
          flex: none !important;
          vertical-align: bottom !important;
        }
        .chat-message { 
          height: auto !important;
          min-height: 0 !important;
          margin-bottom: 6px !important;
          flex: none !important;
          display: flex !important;
        }
        .chat-content {
          height: auto !important;
          min-height: 0 !important;
          width: fit-content !important;
          flex: none !important;
          display: block !important;
        }
        .chat-messages {
          flex: 1 !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          gap: 4px !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .chat-bubble p, .chat-bubble span {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.2 !important;
        }
      `}</style>
      <header className="header">
        <div className="logo">
          <img src="./logo.png" alt="Portnd Logo" className="logo-img" />
          <h1>portnd</h1>
        </div>
        <div className="header-actions">
          <button className="icon-btn theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Dark/Light Mode">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="me-badge">
            <div className="avatar">{myName.charAt(0)}</div>
            <span>{myName}</span>
          </div>
        </div>
      </header>

      <main className="main-content">

        {connectionState === 'disconnected' && (
          <div className="pairing-section">
            <div className="share-code-card">
              <p>Your Share Code</p>
              <div className="code-display-container">
                <div className="code-display-value">{myId || '......'}</div>
                <div className="code-actions">
                  <button className="icon-btn" onClick={copyToClipboard} title="Copy Code"><Copy size={20} /></button>
                  <button className="icon-btn" onClick={resetMyId} title="Generate New Code"><RefreshCw size={20} /></button>
                  <button className="icon-btn" onClick={shareConnectionLink} title="Share Connection Link"><Share2 size={20} /></button>
                  <button
                    className={`icon-btn ${showQr ? 'active' : ''}`}
                    onClick={() => setShowQr(v => !v)}
                    title={showQr ? 'Hide QR Code' : 'Show QR Code'}
                    disabled={!qrDataUrl}
                  >
                    <QrCode size={20} />
                  </button>
                </div>
              </div>
              {showQr && qrDataUrl && (
                <div className="qr-container">
                  <img src={qrDataUrl} alt="QR Code" className="qr-image" />
                  <p className="qr-hint">Scan with the other device's camera to connect instantly</p>
                  <button className="btn-secondary" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--surface-elevated)', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }} onClick={shareConnectionLink}>
                    <Share2 size={15} /> Share Link
                  </button>
                </div>
              )}
              {!showQr && <p className="subtitle">Give this code to your friend to connect.</p>}
            </div>

            <div className="divider"><span>OR</span></div>

            <div className="connect-card">
              <p>Connect to a Friend</p>
              <div className="input-group">
                {isMobileDevice && (
                  <button className="icon-btn scan-btn" onClick={() => setShowScanner(true)} title="Scan QR Code">
                    <QrCode size={18} />
                    <span className="scan-btn-text">Scan QR</span>
                  </button>
                )}
                <input
                  type="text"
                  placeholder="Enter 6-char code"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && connectToPeer()}
                  maxLength={6}
                />
                <button className="primary-btn" onClick={connectToPeer}>Connect</button>
              </div>
            </div>
          </div>
        )}

        {connectError && connectionState === 'disconnected' && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{connectError}</span>
            <button className="icon-btn" onClick={() => setConnectError(null)} title="Dismiss"><X size={16} /></button>
          </div>
        )}

        {peerError && (
          <div className="error-banner fatal">
            <AlertCircle size={18} />
            <span>{peerError}</span>
            <button className="icon-btn" onClick={() => { if (peerRef.current) peerRef.current.destroy(); initPeer(); }} title="Retry">
              <RefreshCw size={16} />
            </button>
          </div>
        )}

        {connectionState === 'connecting' && (
          <div className="connecting-state">
            <div className="radar"></div>
            {connectionRef.current && connectionRef.current.open ? (
              <>
                <p>Waiting for approval…</p>
                <p className="subtitle">Please accept the connection request on the other device.</p>
              </>
            ) : (
              <>
                <p>Connecting… this may take up to 20 seconds on some networks.</p>
                <p className="subtitle">Trying multiple network paths…</p>
              </>
            )}
          </div>
        )}

        {connectionState === 'connected' && (
          <div className={`connected-section ${activeTab}-active`}>
            <div className="peer-badge">
              <div className="pulse-dot"></div>
              <div className="peer-info">
                <span>Connected to: <strong>{connectedPeerName || connectedPeerId}</strong>{peerIsTyping && <span className="typing-indicator-header">is typing...</span>}</span>
                {connectionType === 'local' && (
                  <span className="connection-badge local" title="Fast local network transfer"><Wifi size={14} /> Local Network</span>
                )}
                {connectionType === 'internet' && (
                  <span className="connection-badge internet" title="Transferring over the internet"><Globe size={14} /> Internet</span>
                )}
                {connectionQuality && (
                  <span className={`connection-quality ${connectionQuality}`} title={`Connection quality: ${connectionQuality}`}>
                    <Signal size={14} />
                  </span>
                )}
              </div>
              <button className="text-btn" onClick={disconnect}>Disconnect</button>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="mobile-tabs">
              <button
                className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveTab('files')}
              >
                <FileIcon size={18} /> Files
                {transferState && isTransferMinimized && (
                  <span className="transfer-notification-badge">
                    {transferState.progress}%
                  </span>
                )}
              </button>
              <button
                className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageCircle size={18} /> Chat
                {messages.filter(m => m.sender === 'peer').length > 0 && <span className="notification-dot"></span>}
              </button>
            </div>

            <div className="connected-layout">
              {/* Files Column */}
              <div className={`layout-column files-column ${activeTab === 'files' ? 'show-mobile' : ''}`}>
                {/* Mobile Quick Send Button */}
                <div className="mobile-quick-send">
                  <button className="primary-btn full-width" onClick={() => fileInputRef.current.click()}>
                    <Plus size={18} /> Select Files to Send
                  </button>
                </div>

                {transferState && isTransferMinimized && (
                  <div className="minimized-transfer-card" onClick={() => setIsTransferMinimized(false)}>
                    <div className="mt-icon">
                      {transferState.status === 'sending' ? (
                        <UploadCloud className="pulse-icon" size={20} />
                      ) : (
                        <Download className="pulse-icon" size={20} />
                      )}
                    </div>

                    <div className="mt-details">
                      <div className="mt-header">
                        <span className="mt-title">
                          {transferState.status === 'sending' ? 'Sending' : 'Receiving'}
                          {transferState.totalFiles > 1 && ` (${transferState.fileIndex}/${transferState.totalFiles})`}
                        </span>
                        <span className="mt-percent">{transferState.status === 'complete' ? 'Done!' : transferState.progress === -1 ? '...' : `${transferState.progress}%`}</span>
                      </div>

                      <span className="mt-filename truncate">{transferState.name}</span>

                      <div className="mt-progress-track">
                        <div className="mt-progress-bar" style={{ width: `${transferState.progress}%` }}></div>
                      </div>

                      {(() => {
                        const stats = calculateSpeedAndRemaining(transferState);
                        if (!stats) return null;
                        return (
                          <div className="mt-meta">
                            <span className="mt-speed">{stats.speed}</span>
                            <span className="mt-remaining">{stats.remaining}</span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mt-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="mt-btn-expand"
                        onClick={() => setIsTransferMinimized(false)}
                        title="Expand to Full View"
                      >
                        <ArrowUpRight size={16} />
                      </button>
                      <button
                        className="mt-btn-cancel"
                        onClick={cancelTransfer}
                        title="Cancel Transfer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`drop-zone ${isDragging ? 'dragging' : ''} ${fileQueue.length > 0 ? 'has-files' : ''}`}
                  onClick={() => fileInputRef.current.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  {fileQueue.length === 0 ? (
                    <>
                      <div className="drop-icon"><UploadCloud size={48} /></div>
                      <h3>Click or drop files here</h3>
                      <p>Select multiple files to send all at once</p>
                    </>
                  ) : (
                    <>
                      <div className="drop-icon add-more-icon"><Plus size={32} /></div>
                      <p className="add-more-text">Add more files</p>
                    </>
                  )}
                </div>

                {fileQueue.length > 0 && (
                  <div className="file-queue-section">
                    <div className="file-queue-header">
                      <span className="file-queue-title">
                        <FileIcon size={16} />
                        {fileQueue.length} file{fileQueue.length > 1 ? 's' : ''} &nbsp;·&nbsp; {formatSize(totalQueueSize)}
                      </span>
                      <button className="icon-btn clear-btn" onClick={() => { fileQueueRef.current = []; setFileQueue([]); }} title="Clear all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="file-queue-list">
                      {fileQueue.map((f, i) => (
                        <div key={i} className="file-queue-item">
                          <div className="fq-icon"><FileIcon size={18} /></div>
                          <div className="fq-info">
                            <span className="fq-name truncate">{f.name}</span>
                            <span className="fq-size">{formatSize(f.size)}</span>
                          </div>
                          <button className="icon-btn fq-remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }} title="Remove">
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="send-btn"
                      onClick={sendBatch}
                      disabled={waitingForAccept}
                    >
                      <Send size={18} />
                      {waitingForAccept ? 'Waiting…' : `Send ${fileQueue.length > 1 ? `${fileQueue.length} Files` : 'File'}`}
                    </button>
                  </div>
                )}

                {transferHistory.length > 0 && (
                  <div className="history-section">
                    <div className="history-header">
                      <h3><Clock size={20} /> Transfer History</h3>
                      {confirmClearHistory ? (
                        <div className="clear-confirm">
                          <span>Clear all?</span>
                          <button className="confirm-yes" onClick={() => { clearHistory(); setConfirmClearHistory(false); }}>Yes</button>
                          <button className="confirm-no" onClick={() => setConfirmClearHistory(false)}>No</button>
                        </div>
                      ) : (
                        <button className="icon-btn clear-btn" onClick={() => setConfirmClearHistory(true)} title="Clear History">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="history-list">
                      {transferHistory.map(item => (
                        <div key={item.id} className="history-item">
                          <div className={`history-icon ${item.type}`}>
                            {item.type === 'sent' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                          </div>
                          <div className="history-details">
                            <span className="history-name truncate">{item.name}</span>
                            <span className="history-meta">
                              {item.type === 'sent' ? 'To: ' : 'From: '}{item.peerName} · {formatSize(item.size)}
                            </span>
                          </div>
                          <div className="history-time">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Column */}
              <div
                className={`layout-column chat-column ${activeTab === 'chat' ? 'show-mobile' : ''} ${isChatDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsChatDragging(true); }}
                onDragLeave={() => setIsChatDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsChatDragging(false);
                  if (e.dataTransfer.files.length) {
                    addFilesToQueue(e.dataTransfer.files);
                    setActiveTab('files');
                  }
                }}
              >
                {isChatDragging && (
                  <div className="chat-drag-overlay">
                    <UploadCloud size={40} className="pulse-icon" />
                    <h3>Drop files here to share</h3>
                    <p>Files will be added to the sharing queue</p>
                  </div>
                )}
                {/* Premium Mobile Chat Header - visible only on mobile in chat mode */}
                <div className="mobile-chat-header">
                  <button
                    className="mobile-chat-back"
                    onClick={() => setActiveTab('files')}
                    title="Back to Files"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <div className="mobile-chat-peer-avatar">
                    {(connectedPeerName || connectedPeerId || 'P').charAt(0).toUpperCase()}
                  </div>
                  <div className="mobile-chat-peer-info">
                    <span className="mobile-chat-peer-name">
                      {connectedPeerName || connectedPeerId || 'Peer'}
                    </span>
                    <span className="mobile-chat-peer-status">
                      {peerIsTyping ? 'typing...' : 'Online'}
                    </span>
                  </div>
                  <button
                    className="icon-btn clear-chat-btn"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear the chat history?")) {
                        setMessages([]);
                      }
                    }}
                    title="Clear Chat"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button
                    className="icon-btn theme-toggle mobile-chat-theme-toggle"
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    title="Toggle Dark/Light Mode"
                  >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                  </button>
                </div>
                <div className="chat-section">
                  <div className="chat-messages" ref={chatMessagesRef}>
                    {messages.length === 0 ? (
                      <p className="chat-empty">No messages yet. Say hi!</p>
                    ) : (
                      <>
                        {messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`chat-message ${msg.sender === 'me' ? 'me' : 'peer'}`}
                            onTouchStart={(e) => {
                              const touch = e.touches[0];
                              e.currentTarget.dataset.startX = touch.clientX;
                            }}
                            onTouchMove={(e) => {
                              const startX = parseFloat(e.currentTarget.dataset.startX);
                              if (isNaN(startX)) return;
                              const touch = e.touches[0];
                              const diff = touch.clientX - startX;

                              // Visual feedback (slight slide)
                              if (diff > 10 && diff < 100) {
                                e.currentTarget.style.transform = `translateX(${diff}px)`;
                              }
                            }}
                            onTouchEnd={(e) => {
                              const startX = parseFloat(e.currentTarget.dataset.startX);
                              const endX = e.changedTouches[0].clientX;
                              e.currentTarget.style.transform = '';
                              if (endX - startX > 60) {
                                setReplyingTo(msg);
                                if (window.navigator.vibrate) window.navigator.vibrate(10);
                              }
                              delete e.currentTarget.dataset.startX;
                            }}
                          >
                            <div className="chat-bubble-container">
                              <div className="chat-bubble">
                                {msg.replyTo && (
                                  <div className="chat-reply-quote">
                                    <span className="reply-sender">{msg.replyTo.sender === 'me' ? 'You' : connectedPeerName || 'Peer'}</span>
                                    <p className="truncate">{msg.replyTo.text}</p>
                                  </div>
                                )}
                                {msg.isFile ? (
                                  <div className="chat-file-card">
                                    <div className="cf-icon">
                                      {msg.fileType === 'sent' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                    </div>
                                    <div className="cf-info">
                                      <span className="cf-name truncate">{msg.fileName}</span>
                                      <span className="cf-size">{formatSize(msg.fileSize)} &nbsp;·&nbsp; {msg.fileType === 'sent' ? 'Sent' : 'Received'}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="chat-bubble-text-wrapper">
                                    <LinkifyText text={msg.text} />
                                  </div>
                                )}
                                <span className="chat-time-whatsapp">
                                  {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <button className="bubble-reply-btn" onClick={() => setReplyingTo(msg)}>
                                <ArrowDownLeft size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </>
                    )}
                  </div>
                  <div className="chat-input-area">
                    {replyingTo && (
                      <div className="reply-preview">
                        <div className="reply-preview-content">
                          <span className="reply-preview-sender">{replyingTo.sender === 'me' ? 'Replying to yourself' : `Replying to ${connectedPeerName || 'Peer'}`}</span>
                          <p className="truncate">{replyingTo.text}</p>
                        </div>
                        <button className="reply-cancel" onClick={() => setReplyingTo(null)}><X size={16} /></button>
                      </div>
                    )}
                    <div className="chat-input-row">
                      <div className="input-group">
                        <textarea
                          ref={chatTextareaRef}
                          rows="1"
                          placeholder="Message"
                          value={clipboardText}
                          onChange={(e) => {
                            setClipboardText(e.target.value);
                            handleTyping(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendText();
                              e.target.style.height = 'auto';
                            }
                          }}
                        />
                      </div>
                      <button
                        className="chat-send-btn"
                        onClick={sendText}
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => e.preventDefault()}
                        disabled={!clipboardText.trim()}
                      >
                        <Send size={22} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for acceptance overlay */}
        {waitingForAccept && !transferState && (
          <div className="waiting-overlay">
            <div className="waiting-card">
              <div className="waiting-spinner-premium">
                <div className="waiting-spinner-inner"></div>
              </div>
              <h3>Waiting for Acceptance</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                Your friend needs to accept the files on their device.
              </p>

              <div className="file-info-premium" style={{ margin: '1rem 0' }}>
                <div className="file-icon-wrapper" style={{ padding: '0.8rem', borderRadius: '0.8rem' }}>
                  <FileIcon size={24} />
                </div>
                <span className="file-name-premium truncate" style={{ fontSize: '0.95rem' }}>
                  {fileQueue.length === 1 ? fileQueue[0].name : `${fileQueue.length} files queued`}
                </span>
                <span className="file-size-premium">{formatSize(totalQueueSize)}</span>
              </div>

              <button className="cancel-transfer-btn" style={{ marginTop: '0.5rem' }} onClick={() => {
                setWaitingForAccept(false);
                const sendJson = (payload) => {
                  if (!connectionRef.current) return;
                  const data = new TextEncoder().encode(JSON.stringify(payload));
                  const packet = new Uint8Array(1 + data.length);
                  packet[0] = 0;
                  packet.set(data, 1);
                  connectionRef.current.send(packet);
                };
                sendJson({ type: 'cancel' });
                fileQueueRef.current = [];
                setFileQueue([]);
              }}>
                <X size={16} /> Cancel Request
              </button>
            </div>
          </div>
        )}

        {/* Transfer Progress Modal */}
        {transferState && !isTransferMinimized && (
          <div className="transfer-modal">
            <div className="transfer-card">
              <div className="transfer-header">
                <h3>{transferState.status === 'sending' ? 'Sending File' : 'Receiving File'}</h3>
                <div className="transfer-actions">
                  <button className="icon-btn min-btn" onClick={() => setIsTransferMinimized(true)} title="Minimize to Sidebar">
                    <ArrowDownLeft size={18} />
                  </button>
                  <button className="icon-btn close-btn-cancel" onClick={cancelTransfer} title="Cancel Transfer">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {transferState.totalFiles > 1 && (
                <div className="transfer-batch-label">
                  File {transferState.fileIndex} of {transferState.totalFiles}
                </div>
              )}

              <div className="file-info-premium">
                <div className="file-icon-wrapper">
                  <FileIcon size={32} />
                </div>
                <span className="file-name-premium truncate" style={{ maxWidth: '320px' }}>{transferState.name}</span>
                <span className="file-size-premium">{formatSize(transferState.size || 0)}</span>
              </div>

              <div className="progress-section">
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${transferState.progress === -1 ? 0 : transferState.progress}%` }}></div>
                </div>
                <div className="progress-meta">
                  <span className="progress-text">
                    {transferState.status === 'complete' ? 'Complete!' : transferState.progress === -1 ? 'Preparing...' : `${transferState.progress}%`}
                  </span>
                </div>
              </div>

              {(() => {
                const stats = calculateSpeedAndRemaining(transferState);
                if (!stats) return null;
                return (
                  <div className="transfer-stats-row">
                    <span className="transfer-speed-badge">{stats.speed}</span>
                    <span className="transfer-remaining-text">{stats.remaining}</span>
                  </div>
                );
              })()}

              {transferState.totalFiles > 1 && (
                <div className="overall-progress-container" style={{ width: '100%', marginTop: '1.25rem', textAlign: 'left' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>OVERALL BATCH PROGRESS</span>
                  <div className="overall-progress">
                    <div
                      className="overall-bar"
                      style={{ width: `${Math.round(((transferState.fileIndex - 1) / transferState.totalFiles) * 100 + (transferState.progress / transferState.totalFiles))}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <button className="cancel-transfer-btn" onClick={cancelTransfer}>
                <X size={16} /> Cancel Transfer
              </button>
            </div>
          </div>
        )}

        {/* Incoming Connection Modal */}
        {incomingRequest && (
          <div className="incoming-modal">
            <div className="incoming-card">
              <div className="incoming-icon" style={{ alignSelf: 'center', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                <Wifi size={32} />
              </div>
              <h3 style={{ textAlign: 'center' }}>Connection Request</h3>
              <p style={{ textAlign: 'center', width: '100%', marginBottom: '1.5rem' }}>
                <strong>{incomingRequest.name}</strong> ({incomingRequest.device}) wants to connect with you.
              </p>
              <div className="actions">
                <button className="btn decline" onClick={rejectConnection}>
                  <X size={18} /> Decline
                </button>
                <button className="btn accept" onClick={acceptConnection}>
                  <Check size={18} /> Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incoming Batch Modal */}
        {incomingBatch && !transferState && (
          <div className="incoming-modal">
            <div className="incoming-card">
              <div className="incoming-icon" style={{ alignSelf: 'center' }}><Download size={32} /></div>
              <h3 style={{ textAlign: 'center' }}>Incoming Files</h3>
              <p style={{ textAlign: 'center', width: '100%' }}>
                <strong>{connectedPeerName || connectedPeerId}</strong> wants to share {incomingBatch.files.length} file{incomingBatch.files.length > 1 ? 's' : ''} with you:
              </p>

              <div className="incoming-file-list-premium">
                {incomingBatch.files.map((f, i) => (
                  <div key={i} className="incoming-file-item-premium">
                    <div className="incoming-file-icon">
                      <FileIcon size={18} />
                    </div>
                    <span className="incoming-file-name truncate">{f.name}</span>
                    <span className="incoming-file-size">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>

              <div className="incoming-total-premium">
                <span className="incoming-total-label">Total Size</span>
                <span className="incoming-total-value">{formatSize(incomingBatch.totalSize)}</span>
              </div>

              <div className="actions">
                <button className="btn decline" onClick={rejectBatch}><X size={18} /> Decline</button>
                <button className="btn accept" onClick={acceptBatch}><Check size={18} /> Accept All</button>
              </div>
            </div>
          </div>
        )}





        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} multiple />
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} <strong>Portnd</strong>. Developed by jsk. All rights reserved.</p>
      </footer>

      {showScanner && (
        <QrScanner
          onScan={(code) => {
            setShowScanner(false);
            setTargetInput(code);
            connectToPeer(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

export default App;
