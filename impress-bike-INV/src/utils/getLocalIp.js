import os from "node:os";

export function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const preferredNames = ["Wi-Fi", "Wireless LAN adapter Wi-Fi", "wlan", "wifi"];

  for (const preferredName of preferredNames) {
    const ifaceList = interfaces[preferredName];
    if (ifaceList) {
      for (const iface of ifaceList) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  }

  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }

  return "0.0.0.0";
}
