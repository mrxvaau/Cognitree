import React, { useEffect, useState } from 'react';
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

function Cursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(v => !v), 600);
    return () => clearInterval(t);
  }, []);
  return <Text color="greenBright">{on ? '▌' : ' '}</Text>;
}

function Row({ label, value, warn = false, dim = false }: {
  label: string; value: string; warn?: boolean; dim?: boolean;
}) {
  return (
    <Box>
      <Text color="green" dimColor>{'  ' + label.padEnd(7) + ' '}</Text>
      <Text color={warn ? 'red' : dim ? 'green' : 'greenBright'} dimColor={dim}>{value}</Text>
    </Box>
  );
}

function Ghost() {
  const cpu    = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'Unknown';
  const cores  = os.cpus().length;
  const ip     = getIP();
  const dir    = process.cwd();
  const short  = dir.length > 34 ? '…' + dir.slice(-33) : dir;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="green" dimColor>{'┌─ '}</Text>
        <Text color="greenBright" bold>cognitree</Text>
        <Text color="green" dimColor>{'  ai memory system · v1.0.30'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'│  persistent · structured · agent-ready'}</Text>
      </Box>
      <Box><Text color="green" dimColor>{'│'}</Text></Box>

      <Box>
        <Text color="green" dimColor>{'├─ session '}</Text>
        <Text color="green" dimColor>{'─'.repeat(34)}</Text>
      </Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="time"    value={formatDate()} /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="model"   value="qwen-max · low effort" /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="billing" value="API Usage Billing" dim /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="dir"     value={short} dim /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="cpu"     value={`${cpu.split('@')[0].trim()} · ${cores}c`} /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="ip"      value={ip} dim /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text><Row label="config"  value="no CLAUDE.md" warn /></Box>
      <Box><Text color="green" dimColor>{'│'}</Text></Box>

      <Box>
        <Text color="green" dimColor>{'├─ memory '}</Text>
        <Text color="green" dimColor>{'─'.repeat(35)}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'│  layers '}</Text>
        <Text color="greenBright">{'■'.repeat(7)}</Text>
        <Text color="green" dimColor>{'□'.repeat(3)}</Text>
        <Text color="greenBright">{'  7/10'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'│  git    '}</Text>
        <Text color="greenBright">{'enabled · main'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'│  store  '}</Text>
        <Text color="green" dimColor>{'.cognitree/'}</Text>
      </Box>
      <Box><Text color="green" dimColor>{'│'}</Text></Box>

      <Box>
        <Text color="green" dimColor>{'╰─ '}</Text>
        <Text color="green">{'ready '}</Text>
        <Cursor />
      </Box>
      <Box marginBottom={1} />
    </Box>
  );
}

render(<Ghost />);
