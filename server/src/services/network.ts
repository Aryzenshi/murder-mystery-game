import os from 'node:os';

export interface NetworkInfo {
  port: number;
  /** Best LAN address for this machine, or null when it has none. */
  lanUrl: string | null;
  addresses: string[];
  hostnames: string[];
  /** True when we are confident a phone on the same Wi-Fi can reach us. */
  lanReachable: boolean;
}

/**
 * LAN hosting only works when this process runs on a machine that shares the
 * player's own network (a laptop, a home server, a Raspberry Pi). In a hosted
 * cloud deployment the addresses below are the container's, not the player's,
 * so the UI keeps LAN MODE and ONLINE MODE as separate, labelled choices.
 */
export function getNetworkInfo(port: number): NetworkInfo {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  addresses.sort((a, b) => score(a) - score(b));
  const best = addresses[0] ?? null;
  return {
    port,
    lanUrl: best ? `http://${best}:${port}` : null,
    addresses,
    hostnames: [os.hostname()],
    lanReachable: !!best,
  };
}

/** Prefer ordinary home/office subnets over virtual adapters. */
function score(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (address.startsWith('172.')) return 2;
  return 3;
}
