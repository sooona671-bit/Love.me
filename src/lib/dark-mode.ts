export function applyDarkMode(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", enabled);
  try { localStorage.setItem("hearth-dark", enabled ? "1" : "0"); } catch {}
}

export function readDarkModePref(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem("hearth-dark") === "1"; } catch { return false; }
}
