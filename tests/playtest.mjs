// Headless play-test for Tideglass (Node standard library only, no dependencies).
// Drives the Playwright headless shell over CDP: loads the game, checks the title
// screen announces itself, starts with Space, pauses and resumes with P, then loads
// the staged game-over scene and restarts it with Space. Fails on any page exception
// or console error. The game server (node serve.ts --port 8080) must be running.
//
// Run: node tests/playtest.mjs
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CHROME = readdirSync(join(homedir(), '.cache', 'ms-playwright'))
  .filter((n) => n.startsWith('chromium_headless_shell-'))
  .map((n) => join(homedir(), '.cache', 'ms-playwright', n, 'chrome-headless-shell-linux64', 'chrome-headless-shell'))[0];
const PORT = 9223;
const BASE = 'http://localhost:8080';
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-gpu', '--headless=new',
  `--remote-debugging-port=${PORT}`, '--window-size=1280,480', 'about:blank',
], { stdio: 'ignore' });
try {
  let wsUrl = null;
  for (let attempt = 0; attempt < 30 && wsUrl === null; attempt += 1) {
    await sleep(500);
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (wsUrl === null) throw new Error('headless shell did not open a debugger port');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const exceptions = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails?.text ?? 'exception');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  function send(method, params = {}) {
    const messageId = ++id;
    return new Promise((resolve) => {
      pending.set(messageId, resolve);
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  }
  const created = await send('Target.createTarget', { url: `${BASE}/` });
  const attached = await send('Target.attachToTarget', { targetId: created.result.targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  // Flat mode: address the page session through the browser websocket.
  const sendToPage = (method, params = {}) => {
    const messageId = ++id;
    return new Promise((resolve) => {
      pending.set(messageId, resolve);
      ws.send(JSON.stringify({ id: messageId, sessionId, method, params }));
    });
  };
  // Rebind helpers to the page session.
  const pageEvaluate = async (expression) => {
    const result = await sendToPage('Runtime.evaluate', { expression, returnByValue: true });
    return result.result?.result?.value;
  };
  const pageKey = (type, keyName, code) => sendToPage('Input.dispatchKeyEvent', { type, key: keyName, code });
  await sendToPage('Runtime.enable');
  await sendToPage('Page.enable');
  await sleep(1500);

  const titleStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('title screen announces itself', titleStatus.startsWith('Tideglass'), titleStatus);
  check('canvas present', await pageEvaluate(`!!document.getElementById('game')`));

  await pageKey('keyDown', ' ', 'Space');
  await pageKey('keyUp', ' ', 'Space');
  await sleep(1200);
  const playingStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('Space starts the game', playingStatus.startsWith('Playing'), playingStatus);
  const scoreAfterPlay = await pageEvaluate(`document.querySelector('canvas') ? 'canvas-ok' : 'missing'`);
  check('game canvas alive after start', scoreAfterPlay === 'canvas-ok');

  await pageKey('keyDown', 'p', 'KeyP');
  await pageKey('keyUp', 'p', 'KeyP');
  await sleep(300);
  const pausedStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('P pauses the game', pausedStatus === 'Paused.', pausedStatus);
  await pageKey('keyDown', 'p', 'KeyP');
  await pageKey('keyUp', 'p', 'KeyP');
  await sleep(300);
  const resumedStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('P resumes the game', resumedStatus === 'Playing.', resumedStatus);

  // Restart from the staged game-over scene: Space reloads into the live game, where
  // Space starts a new game from the title screen.
  await sendToPage('Page.navigate', { url: `${BASE}/?shot=end&seed=1` });
  await sleep(1500);
  const overStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('staged end scene shows game over', overStatus.startsWith('Game over'), overStatus);
  await pageKey('keyDown', ' ', 'Space');
  await pageKey('keyUp', ' ', 'Space');
  await sleep(1500);
  const reloadedUrl = await pageEvaluate(`window.location.href`);
  const titleAgain = await pageEvaluate(`document.getElementById('status').textContent`);
  check('Space on game over reloads the live game', !reloadedUrl.includes('shot=') && titleAgain.startsWith('Tideglass'), `${reloadedUrl} / ${titleAgain}`);
  await pageKey('keyDown', ' ', 'Space');
  await pageKey('keyUp', ' ', 'Space');
  await sleep(800);
  const restartedStatus = await pageEvaluate(`document.getElementById('status').textContent`);
  check('Space starts a new game after restart', restartedStatus.startsWith('Playing'), restartedStatus);

  check('no page exceptions', exceptions.length === 0, exceptions.join('; '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.join('; '));
  ws.close();
} finally {
  chrome.kill();
}

console.log(failures === 0 ? '\nPlay-test passed.' : `\n${failures} play-test check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
