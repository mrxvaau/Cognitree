import React from 'react';
import { render, Box, Text } from 'ink';
import os from 'os';

function getIP(): string {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

function formatDate(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

const W    = 60;
const LINE = '─'.repeat(W - 2);
const HASH = '#'.repeat(W - 6);

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  const inner = '  ' + label.padEnd(7) + '  ' + value;
  const pad   = Math.max(1, W - inner.length - 2);
  return (
    <Box>
      <Text color="green">{'│'}</Text>
      <Text color="green" dimColor>{'  ' + label.padEnd(7) + '  '}</Text>
      <Text color={warn ? 'red' : 'white'}>{value}</Text>
      <Text color="green">{' '.repeat(pad) + '│'}</Text>
    </Box>
  );
}

function Warlord() {
  const cpu   = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'Unknown';
  const cores = os.cpus().length;
  const ip    = getIP();
  const dir   = process.cwd();
  const short = dir.length > 36 ? '…' + dir.slice(-35) : dir;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green">{'┌' + LINE + '┐'}</Text>
      <Box>
        <Text color="green">{'│'}</Text>
        <Text backgroundColor="green" color="black" bold>{'  COGNITREE  v1.0.30  //  WARLORD EDITION  '}</Text>
        <Text color="green">{' '.repeat(W - 47) + '│'}</Text>
      </Box>
      <Text color="green">{'├' + LINE + '┤'}</Text>
      <Box>
        <Text color="green">{'│  '}</Text>
        <Text color="green" bold>{HASH}</Text>
        <Text color="green">{'  │'}</Text>
      </Box>
      <Box>
        <Text color="green">{'│  #  '}</Text>
        <Text color="greenBright" bold>{'COGNITREE'}</Text>
        <Text color="green">{' '.repeat(W - 20) + '#  │'}</Text>
      </Box>
      <Box>
        <Text color="green">{'│  #  '}</Text>
        <Text color="green">{'AI MEMORY // BRUTAL // PERSISTENT'}</Text>
        <Text color="green">{' '.repeat(W - 44) + '#  │'}</Text>
      </Box>
      <Box>
        <Text color="green">{'│  '}</Text>
        <Text color="green" bold>{HASH}</Text>
        <Text color="green">{'  │'}</Text>
      </Box>
      <Box><Text color="green">{'│' + ' '.repeat(W - 2) + '│'}</Text></Box>
      <Text color="green">{'├── SESSION ' + '─'.repeat(W - 14) + '┤'}</Text>
      <Row label="TIME"   value={formatDate()} />
      <Row label="MODEL"  value="qwen-max · low effort · API billing" />
      <Row label="DIR"    value={short} />
      <Row label="CPU"    value={cpu.split('@')[0].trim() + ' · ' + cores + ' cores'} />
      <Row label="IP"     value={ip} />
      <Row label="CONFIG" value="[WARN] No CLAUDE.md detected" warn />
      <Text color="green">{'├── MEMORY ' + '─'.repeat(W - 13) + '┤'}</Text>
      <Box>
        <Text color="green">{'│  LAYERS  '}</Text>
        <Text color="greenBright">{'█'.repeat(10)}</Text>
        <Text color="green" dimColor>{'░░'}</Text>
        <Text color="greenBright">{'  10/10'}</Text>
        <Text color="green" dimColor>{'   GIT '}</Text>
        <Text color="greenBright">{'ON'}</Text>
        <Text color="green" dimColor>{'   STORE '}</Text>
        <Text color="greenBright">{'.cognitree/'}</Text>
        <Text color="green">{'   │'}</Text>
      </Box>
      <Text color="green">{'├' + LINE + '┤'}</Text>
      <Box>
        <Text color="green">{'│  root@cognitree:~$ '}</Text>
        <Text color="greenBright">{'_'}</Text>
        <Text color="green">{' '.repeat(W - 25) + '│'}</Text>
      </Box>
      <Text color="green">{'└' + LINE + '┘'}</Text>
      <Box marginBottom={1} />
    </Box>
  );
}

const { unmount } = render(<Warlord />);
setTimeout(() => { unmount(); process.exit(0); }, 300);
