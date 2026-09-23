import os from "node:os";
import { toQR } from "toqr";

// Virtual adapters (WSL, Hyper-V, VirtualBox, Docker) are unreachable from a phone, so they go last or are dropped.
const virtualAdapter = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|Loopback|utun|bridge/i;
const virtualSubnet = /^(192\.168\.56\.|172\.(1[6-9]|2\d|3[01])\.)/;

// Addresses a phone on the same network can use to open the web version.
export function lanUrls(port) {
  const candidates = [];
  for (const [adapter, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (virtualAdapter.test(adapter) || virtualSubnet.test(address.address)) continue;
      candidates.push(`http://${address.address}:${port}`);
    }
  }
  return candidates;
}

export function qrSvg(text) {
  const modules = toQR(text);
  const size = Math.sqrt(modules.length);
  const quiet = 4;
  let path = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (modules[y * size + x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  }
  const box = size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#111936" d="${path}"/></svg>`;
}
