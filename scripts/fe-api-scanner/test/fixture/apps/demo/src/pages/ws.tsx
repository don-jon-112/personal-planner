export default function Ws() {
  const socket = new WebSocket('wss://example.invalid/live'); // network access the scanner cannot classify -> audit
  return socket ? null : null;
}
