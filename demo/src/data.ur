// Simulated async data source. In a Tauri app this would call
// invoke("get_cities") — the shape is identical: an async kaam returning data.
bahar Promise;

kaam sabr(ms: adad): koi {
  wapas Promise.resolve(ms); // stand-in for a real network/IPC delay
}

bhejo kaam shehrLao(): koi {
  intezar sabr(10);
  wapas ["Karachi", "Lahore", "Islamabad", "Peshawar", "Quetta"];
}
