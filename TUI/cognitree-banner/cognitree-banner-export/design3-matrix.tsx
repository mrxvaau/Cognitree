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

const LOGO = [
  ' ██████╗ ██████╗  ██████╗ ███╗  ██╗',
  '██╔════╝██╔═══██╗██╔════╝ ████╗ ██║',
  '██║     ██║   ██║██║  ███╗██╔██╗██║',
  '██║     ██║   ██║██║   ██║██║╚████║',
  '╚██████╗╚██████╔╝╚██████╔╝██║ ╚███║',
  ' ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚══╝',
];

const LOGO_COLORS = ['#003300','#005500','#007700','#00aa00','#00cc00','#00ff41'];
const DIV = '─'.repeat(52);

function Matrix() {
  const cpu   = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'Unknown';
  const cores = os.cpus().length;
  const ip    = getIP();
  const dir   = process.cwd();
  const short = dir.length > 24 ? '…' + dir.slice(-23) : dir;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="green" dimColor>{'  C O G N I T R E E  ·  v1.0.30  ·  AI MEMORY SYSTEM'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'  ' + '═'.repeat(52)}</Text>
      </Box>

      {LOGO.map((line, i) => (
        <Text key={i} color={i >= 4 ? 'greenBright' : 'green'} dimColor={i < 2}>
          {'  ' + line}
        </Text>
      ))}

      <Box><Text color="green" dimColor>{'  ' + DIV}</Text></Box>

      <Box>
        <Text color="green" dimColor>{'  time   '}</Text>
        <Text color="green">{formatDate()}</Text>
        <Text color="green" dimColor>{'   model  '}</Text>
        <Text color="greenBright">{'qwen-max'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'  cpu    '}</Text>
        <Text color="green">{cpu.split('@')[0].trim() + ' · ' + cores + 'c'}</Text>
        <Text color="green" dimColor>{'   ip     '}</Text>
        <Text color="green">{ip}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'  dir    '}</Text>
        <Text color="green" dimColor>{short}</Text>
        <Text color="green" dimColor>{'   cfg    '}</Text>
        <Text color="red">{'no CLAUDE.md'}</Text>
      </Box>
      <Box>
        <Text color="green" dimColor>{'  mem    '}</Text>
        <Text color="greenBright">{'█'.repeat(12)}</Text>
        <Text color="green" dimColor>{'░░'}</Text>
        <Text color="green">{'  10/10 layers'}</Text>
      </Box>

      <Box><Text color="green" dimColor>{'  ' + DIV}</Text></Box>

      <Box>
        <Text color="green" dimColor>{'  [ '}</Text>
        <Text color="greenBright" bold>{'SYSTEM ONLINE'}</Text>
        <Text color="green" dimColor>{' · '}</Text>
        <Text color="green">{'GIT TREE ACTIVE'}</Text>
        <Text color="green" dimColor>{' · '}</Text>
        <Text color="green" dimColor>{'JSON STORE READY'}</Text>
        <Text color="green" dimColor>{' ]'}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green" dimColor>{'  $ '}</Text>
        <Text color="greenBright">{'_'}</Text>
      </Box>
      <Box marginBottom={1} />
    </Box>
  );
}

const { unmount } = render(<Matrix />);
setTimeout(() => { unmount(); process.exit(0); }, 300);
