import { createApp } from './app';
import { getNetworkInfo } from './services/network';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const { server, manager } = createApp(PORT);

server.listen(PORT, HOST, () => {
  const info = getNetworkInfo(PORT);
  /* eslint-disable no-console */
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────┐');
  console.log('  │  MYSTERY MANSION — server is listening           │');
  console.log('  └──────────────────────────────────────────────────┘');
  console.log(`  Local:    http://localhost:${PORT}`);
  if (info.lanUrl) {
    console.log(`  LAN:      ${info.lanUrl}   (devices on the same Wi-Fi)`);
  } else {
    console.log('  LAN:      no LAN address detected on this machine');
  }
  console.log(`  Rooms:    ${manager.size}`);
  console.log('');
});
