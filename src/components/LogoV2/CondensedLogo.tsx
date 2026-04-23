import * as React from 'react';
import { useState } from 'react';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { getEffortSuffix } from '../../utils/effort.js';
import { getLogoDisplayData, truncatePath } from '../../utils/logoV2Utils.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { Clawd } from './Clawd.js';
import { getSystemInfoSync } from '../../utils/systemInfo.js';
import { existsSync } from 'fs';
import { join } from 'path';

export function CondensedLogo() {
  const { columns } = useTerminalSize();
  const agent = useAppState((s: any) => s.agent);
  const effortValue = useAppState((s: any) => s.effortValue);
  const model = useMainLoopModel();
  const modelDisplayName = renderModelSetting(model);
  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData();
  const agentName = agent ?? agentNameFromSettings;
  const effortSuffix = getEffortSuffix(model, effortValue);

  const [sysInfo] = useState(() => getSystemInfoSync());

  const hasMd = existsSync(join(cwd, 'CLAUDE.md'));

  const now = new Date();
  const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' \u00b7 ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const cwdDisplay = agentName ? `@${agentName} \u00b7 ${truncatePath(cwd, 45)}` : truncatePath(cwd, 55);
  const storageStr = sysInfo.storageTotal > 0
    ? `${sysInfo.storageFree} GB free / ${sysInfo.storageTotal} GB`
    : 'N/A';

  return (
    <OffscreenFreeze>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="claude"
        borderText={{ content: ` Cognitree v${version} `, position: 'top' as const, align: 'start' as const, offset: 1 }}
        paddingX={2}
        width={columns}
      >
        {/* Logo */}
        <Box justifyContent="center" marginTop={1}>
          <Clawd />
        </Box>

        {/* Brand */}
        <Box justifyContent="center">
          <Text bold={true} color="claude">{'\u2726'} Cognitree {'\u2726'}</Text>
        </Box>
        <Box justifyContent="center">
          <Text dimColor={true}>Welcome back!</Text>
        </Box>

        {/* Session Section */}
        <Box marginTop={1}>
          <Text dimColor={true} bold={true}>{'\u2500\u2500 Session \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={1}>
          <Text dimColor={true}>  Time    {timeStr}</Text>
          <Text dimColor={true}>  Model   {modelDisplayName}{effortSuffix} {'\u00b7'} {billingType}</Text>
          <Text dimColor={true}>  Dir     {cwdDisplay}</Text>
          <Text dimColor={true}>  Config  {hasMd ? 'CLAUDE.md found' : 'No CLAUDE.md'}</Text>
        </Box>

        {/* System Section */}
        <Box marginTop={1}>
          <Text dimColor={true} bold={true}>{'\u2500\u2500 System \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}</Text>
        </Box>
        <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
          <Text dimColor={true}>  CPU     {sysInfo.cpu} ({sysInfo.cpuCores} cores)</Text>
          <Text dimColor={true}>  GPU     {sysInfo.gpu}</Text>
          <Text dimColor={true}>  Disk    {storageStr}</Text>
          <Text dimColor={true}>  IP      {sysInfo.ip}</Text>
        </Box>
      </Box>
    </OffscreenFreeze>
  );
}
