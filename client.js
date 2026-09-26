const socket = io();

// ---------- Screens ----------
const homeScreen = document.getElementById('home-screen');
const roomScreen = document.getElementById('room-screen');
const homeError = document.getElementById('home-error');

function showError(msg) {
  homeError.textContent = msg;
  homeError.hidden = false;
}

// ---------- Home screen: create / join ----------
document.getElementById('create-btn').addEventListener('click', () => {
  socket.emit('create-room', (res) => {
    if (!res.ok) { showError('Could not create a room. Try again.'); return; }
    enterRoom(res.roomCode);
  });
});

document.getElementById('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('join-code-input').value;
  if (!code.trim()) return;
  socket.emit('join-room', code, (res) => {
    if (!res.ok) { showError(res.error); return; }
    enterRoom(res.roomCode);
  });
});

function enterRoom(roomCode) {
  homeScreen.hidden = true;
  roomScreen.hidden = false;
  document.getElementById('room-code-display').textContent = roomCode;
}

document.getElementById('copy-code-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code);
});

document.getElementById('leave-btn').addEventListener('click', () => {
  window.location.reload();
});

const peerStatus = document.getElementById('peer-status');
socket.on('peer-joined', () => {
  peerStatus.textContent = 'Connected';
  peerStatus.classList.add('connected');
  startCall(true); // we were already in the room, so we initiate
});
socket.on('peer-left', () => {
  peerStatus.textContent = 'The other person left';
  peerStatus.classList.remove('connected');
  if (remoteVideo.srcObject) remoteVideo.srcObject = null;
});

// =======================================================
// MOVIE PLAYBACK SYNC
// Each person plays their own local copy of the file.
// Only play/pause/seek + timestamps travel over the network.
// =======================================================
const movie = document.getElementById('movie');
const fileInput = document.getElementById('file-input');
const pickerOverlay = document.getElementById('picker-overlay');

let applyingRemoteChange = false; // guards against echo loops
let lastSentTime = 0;

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  movie.src = URL.createObjectURL(file);
  pickerOverlay.style.display = 'none';
  // Ask the other side where they currently are, in case we joined late
  socket.emit('request-sync-state');
});

movie.addEventListener('play', () => {
  if (applyingRemoteChange) return;
  socket.emit('video-sync', { action: 'play', time: movie.currentTime });
});

movie.addEventListener('pause', () => {
  if (applyingRemoteChange) return;
  socket.emit('video-sync', { action: 'pause', time: movie.currentTime });
});

// Seeking fires 'seeked' once the new position is settled
movie.addEventListener('seeked', () => {
  if (applyingRemoteChange) return;
  socket.emit('video-sync', { action: 'seek', time: movie.currentTime });
});

// Periodically nudge the other side's clock back in sync (handles drift)
setInterval(() => {
  if (movie.paused || !movie.src) return;
  if (Math.abs(movie.currentTime - lastSentTime) < 4) return;
  lastSentTime = movie.currentTime;
  socket.emit('video-sync', { action: 'heartbeat', time: movie.currentTime });
}, 4000);

socket.on('video-sync', ({ action, time }) => {
  applyingRemoteChange = true;

  const drift = Math.abs(movie.currentTime - time);

  if (action === 'play') {
    if (drift > 0.6) movie.currentTime = time;
    movie.play().catch(() => {});
  } else if (action === 'pause') {
    movie.pause();
    if (drift > 0.6) movie.currentTime = time;
  } else if (action === 'seek') {
    movie.currentTime = time;
  } else if (action === 'heartbeat') {
    if (drift > 1.5) movie.currentTime = time;
  }

  setTimeout(() => { applyingRemoteChange = false; }, 150);
});

socket.on('request-sync-state', () => {
  if (!movie.src) return;
  socket.emit('video-sync', {
    action: movie.paused ? 'pause' : 'play',
    time: movie.currentTime,
  });
});

// =======================================================
// LIVE CALL (WebRTC) — separate from the movie screen
// =======================================================
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const micToggle = document.getElementById('mic-toggle');
const camToggle = document.getElementById('cam-toggle');

let localStream = null;
let peerConnection = null;
let callStarted = false;

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

async function getLocalMedia() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  return localStream;
}

async function startCall(isInitiator) {
  if (callStarted) return;
  callStarted = true;

  const stream = await getLocalMedia().catch((err) => {
    console.error('Could not access camera/mic:', err);
    return null;
  });
  if (!stream) return;

  peerConnection = new RTCPeerConnection(rtcConfig);

  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { type: 'candidate', candidate: event.candidate });
    }
  };

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { type: 'offer', sdp: offer });
  }
}

socket.on('signal', async (data) => {
  // If we haven't started our side of the call yet (we're the one who joined
  // and an offer just arrived), set it up now as the non-initiator.
  if (!callStarted) await startCall(false);

  if (data.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('signal', { type: 'answer', sdp: answer });
  } else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if (data.type === 'candidate') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }
});

micToggle.addEventListener('click', () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  micToggle.classList.toggle('is-on', track.enabled);
  micToggle.classList.toggle('is-off', !track.enabled);
});

camToggle.addEventListener('click', () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  camToggle.classList.toggle('is-on', track.enabled);
  camToggle.classList.toggle('is-off', !track.enabled);
});
