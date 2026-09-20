export function parseOrigins(raw) {
  return (raw || 'http://localhost:5173,http://localhost:4173')
    .split(',').map(s => s.trim()).filter(Boolean);
}
