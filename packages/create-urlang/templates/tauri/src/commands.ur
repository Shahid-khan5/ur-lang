// Typed wrappers over your Rust commands — one kaam per #[tauri::command].
// This is the same pattern TypeScript Tauri apps use, with types enforced.
lao { invoke } "@tauri-apps/api/core" se;

bhejo kaam greet(naam: lafz): lafz {
  wapas intezar invoke("greet", { name: naam });
}
