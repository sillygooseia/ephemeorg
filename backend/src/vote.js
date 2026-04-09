import { EphemeDevice } from '@epheme/core/browser';

// ─── Device identity ─────────────────────────────────────────────────────────
// EphemeDevice.getStableId() handles the full priority chain:
//   1. Hub-registered deviceId (if the visitor has an Epheme Hub device)
//   2. Anonymous stable UUID persisted in localStorage under the given key
// No manual fallback needed — that logic lives in the library.

const POLL_DEVICE_KEY = 'ephemeorg:vote-device-id';
const POLL_ENDPOINT = '/api/votes';

const _device = new EphemeDevice();
let _deviceLoaded = false;

async function ensureDevice() {
  if (!_deviceLoaded) {
    await _device.load();
    _deviceLoaded = true;
  }
}

async function getRequestHeaders() {
  await ensureDevice();
  const headers = { 'Content-Type': 'application/json' };
  if (_device.isRegistered && _device.jwt) {
    // Hub-registered: JWT carries device_id — server verifies and extracts it
    headers['Authorization'] = `Bearer ${_device.jwt}`;
  } else {
    // getStableId() returns Hub deviceId if available, or creates/reads an
    // anonymous UUID from localStorage — no re-implementation needed here.
    headers['X-Device-Id'] = _device.getStableId(POLL_DEVICE_KEY);
  }
  return headers;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function formatResetTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(Number(timestamp)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function setStatus(message) {
  const el = document.getElementById('poll-status');
  if (el) el.textContent = message;
}

function setCounts({ up = 0, down = 0, resetAt = null, deviceVote = null }) {
  const upEl = document.getElementById('poll-count-up');
  const downEl = document.getElementById('poll-count-down');
  const resetEl = document.getElementById('poll-reset');
  if (upEl) upEl.textContent = String(up);
  if (downEl) downEl.textContent = String(down);
  if (resetEl) resetEl.textContent = formatResetTime(resetAt);
  document.querySelectorAll('.poll-button[data-vote]').forEach((btn) => {
    btn.classList.toggle('selected', btn.getAttribute('data-vote') === deviceVote);
  });
}

function setButtonsDisabled(value) {
  document.querySelectorAll('.poll-button[data-vote]').forEach((btn) => {
    btn.disabled = value;
  });
}

// ─── Poll API ────────────────────────────────────────────────────────────────

async function loadVotes() {
  try {
    setButtonsDisabled(true);
    setStatus('Refreshing poll…');
    const response = await fetch(POLL_ENDPOINT, { headers: await getRequestHeaders() });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Unable to load poll results.');
      return;
    }
    setCounts(data);
    if (data.unavailable) {
      setStatus('Poll storage not available right now.');
      setButtonsDisabled(true);
      return;
    }
    setStatus(data.deviceVote ? 'Your vote is recorded.' : 'Your vote helps shape the direction.');
  } catch {
    setStatus('Unable to contact poll service.');
  } finally {
    setButtonsDisabled(false);
  }
}

async function submitVote(vote) {
  try {
    setButtonsDisabled(true);
    setStatus('Sending your vote…');
    const response = await fetch(POLL_ENDPOINT, {
      method: 'POST',
      headers: await getRequestHeaders(),
      body: JSON.stringify({ vote }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Unable to submit vote.');
      return;
    }
    setCounts(data);
    setStatus('Vote recorded. Thank you.');
  } catch {
    setStatus('Unable to submit vote.');
  } finally {
    setButtonsDisabled(false);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.poll-button[data-vote]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const vote = btn.getAttribute('data-vote');
      if (vote) await submitVote(vote);
    });
  });
  loadVotes();
});
