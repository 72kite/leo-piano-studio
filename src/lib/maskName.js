/** Partially obfuscates a username for the Focus tab's "mask usernames in
 * global races" broadcast — keeps the first two characters (avatar
 * initials already show these, so nothing new leaks) and replaces the
 * rest with bullets. */
export function maskName(name) {
  if (!name) return name;
  const visible = name.slice(0, 2);
  return visible + '•'.repeat(Math.max(3, name.length - 2));
}
