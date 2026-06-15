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

const DIV = '─'.repeat(56);

function Slab() {
  const cpu   = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'Unknown';
  const cores = os.cpus().length;
  const ip    = getIP();
  const dir   = process.cwd();
  const short = dir.length > 28 ? '…' + dir.slice(-27) : dir;
  const time  = formatDate();

  return (
    <Box flexDirection="column" marginTop={1}>

      {/* thick header slab */}
      <Box backgroundColor="green" paddingX={2}>
        <Text color="black" bold>{'COGNITREE  '}</Text>
        <Text color="black">{'v1.0.30  ·  AI MEMORY SYSTEM  ·  PERSISTENT  ·  BRUTAL'}</Text>
      </Box>

      <Text color="green" dimColor>{DIV}</Text>

      {/* row 1 */}
      <Box>
        <Box flexDirection="column" width="50%" paddingX={2} paddingY={0}>
          <Text color="green" dimColor>{'TIME'}</Text>
          <Text color="greenBright" bold>{time.split(',')[0]}</Text>
          <Text color="green" dimColor>{time.split(',').slice(1).join(',').trim()}</Text>
        </Box>
        <Box flexDirection="column" width="50%" paddingX={2} paddingY={0}>
          <Text color="green" dimColor>{'MODEL'}</Text>
          <Text color="greenBright" bold>{'qwen-max'}</Text>
          <Text color="green" dimColor>{'low effort · API billing'}</Text>
        </Box>
      </Box>

      <Text color="green" dimColor>{DIV}</Text>

      {/* row 2 */}
      <Box>
        <Box flexDirection="column" width="50%" paddingX={2} paddingY={0}>
          <Text color="green" dimColor>{'CPU'}</Text>
          <Text color="greenBright" bold>{cpu.split('@')[0].trim()}</Text>
          <Text color="green" dimColor>{cores + ' cores · ' + (os.cpus()[0]?.speed / 1000).toFixed(2) + 'GHz'}</Text>
        </Box>
        <Box flexDirection="column" width="50%" paddingX={2} paddingY={0}>
          <Text color="green" dimColor>{'MEMORY'}</Text>
          <Text color="greenBright" bold>{'10 / 10 layers'}</Text>
          <Text color="green" dimColor>{'git-tree · json store'}</Text>
        </Box>
      </Box>

      <Text color="green" dimColor>{DIV}</Text>

      {/* info row */}
      <Box paddingX={2}>
        <Text color="green" dimColor>{'DIR  '}</Text>
        <Text color="greenBright">{short}</Text>
        <Text color="green" dimColor>{'   IP  '}</Text>
        <Text color="green">{ip}</Text>
        <Text color="green" dimColor>{'   CFG  '}</Text>
        <Text color="red">{'⚠ NO CLAUDE.MD'}</Text>
      </Box>

      <Text color="green" dimColor>{DIV}</Text>

      {/* prompt */}
      <Box paddingX={2}>
        <Text color="green" dimColor>{'READY  '}</Text>
        <Text color="green" dimColor>{'─'.repeat(28) + '  '}</Text>
        <Text color="greenBright" bold>{'█'}</Text>
      </Box>

      <Box marginBottom={1} />
    </Box>
  );
}

const { unmount } = render(<Slab />);
setTimeout(() => { unmount(); process.exit(0); }, 300);
