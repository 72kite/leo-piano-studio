import crypto from 'node:crypto';

const ADJ = ['swift', 'bold', 'calm', 'keen', 'cool', 'sharp', 'quick', 'agile', 'nimble', 'laser'];
const NOUN = ['tiger', 'eagle', 'falcon', 'panda', 'wolf', 'hawk', 'lynx', 'raven', 'cobra', 'fox'];
const cap = w => w[0].toUpperCase() + w.slice(1);

/** Mirrors the client's makeFriendlyGuestId() style so guest names look consistent everywhere. */
export function makeGuestIdentity() {
  const username = `${cap(ADJ[Math.floor(Math.random() * ADJ.length)])}${cap(NOUN[Math.floor(Math.random() * NOUN.length)])}_${Math.floor(Math.random() * 90) + 10}`;
  return {
    userId: `guest_${crypto.randomUUID()}`,
    username,
    role: 'guest',
    mmr: 1000,
    wallet: 0,
    isGuest: true,
  };
}
