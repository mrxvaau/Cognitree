import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getEffortSuffix } from '../../utils/effort.js'
import { getLogoDisplayData, truncatePath } from '../../utils/logoV2Utils.js'
import { renderModelSetting } from '../../utils/model/model.js'
import { getSystemInfoSync } from '../../utils/systemInfo.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { Clawd } from './Clawd.js'

export function CondensedLogo() {
	const { columns, rows } = useTerminalSize()
	const agent = useAppState((s: any) => s.agent)
	const effortValue = useAppState((s: any) => s.effortValue)
	const model = useMainLoopModel()
	const modelDisplayName = renderModelSetting(model)
	const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData()
	const agentName = agent ?? agentNameFromSettings
	const effortSuffix = getEffortSuffix(model, effortValue)

	const [sysInfo] = useState(() => getSystemInfoSync())

	// Memory-file check matches what the engine actually loads: CLAUDE.md is
	// the canonical memory file (Cognitree.md is a legacy alias), and an
	// initialized .cognitree/ dir counts as configured too — a repo shouldn't
	// show "✗ no memory file" when the memory engine is already active.
	const hasMd =
		existsSync(join(cwd, 'Cognitree.md')) ||
		existsSync(join(cwd, 'CLAUDE.md')) ||
		existsSync(join(cwd, '.cognitree', 'tree.json'))

	const now = new Date()
	const timeStr = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u00b7 ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`

	const cwdDisplay = agentName
		? `@${agentName} \u00b7 ${truncatePath(cwd, 45)}`
		: truncatePath(cwd, 55)
	const storageStr =
		sysInfo.storageTotal > 0
			? `${sysInfo.storageFree} GB free / ${sysInfo.storageTotal} GB total`
			: 'Detecting...'
	const storagePercent =
		sysInfo.storageTotal > 0
			? Math.round(((sysInfo.storageTotal - sysInfo.storageFree) / sysInfo.storageTotal) * 100)
			: 0

	// Dynamic divider width based on terminal
	const innerWidth = Math.max(columns - 8, 40)
	const makeDivider = (label: string) => {
		const remaining = innerWidth - label.length - 5
		return `\u2500\u2500 ${label} ${'\u2500'.repeat(Math.max(remaining, 10))}`
	}

	return (
		<OffscreenFreeze>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="clawd_body"
				borderText={{
					content: ` \u2726 Cognitree v${version} `,
					position: 'top' as const,
					align: 'center' as const,
				}}
				paddingX={2}
				width={columns}
			>
				{/* Logo */}
				<Box justifyContent="center" marginTop={1}>
					<Clawd />
				</Box>

				{/* Brand */}
				<Box justifyContent="center" marginTop={1}>
					<Text bold={true} color="clawd_body">
						{'\u2726\u2726\u2726'} C O G N I T R E E {'\u2726\u2726\u2726'}
					</Text>
				</Box>
				<Box justifyContent="center">
					<Text color="clawd_body">
						{
							'\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
						}
					</Text>
				</Box>
				<Box justifyContent="center">
					<Text dimColor={true} italic={true}>
						{'\u2726'} Welcome back! Let's build something amazing.
					</Text>
				</Box>

				{/* Session Section */}
				<Box marginTop={1}>
					<Text color="clawd_body" bold={true}>
						{makeDivider('\u25C8 Session')}
					</Text>
				</Box>
				<Box flexDirection="column" paddingLeft={2}>
					<Text>
						{' '}
						<Text color="clawd_body">{'\u25F7'}</Text> <Text dimColor={true}>Time </Text>{' '}
						<Text>{timeStr}</Text>
					</Text>
					<Text>
						{' '}
						<Text color="clawd_body">{'\u25C8'}</Text> <Text dimColor={true}>Model </Text>{' '}
						<Text bold={true} color="clawd_body">
							{modelDisplayName}
							{effortSuffix}
						</Text>{' '}
						<Text dimColor={true}>
							{'\u00b7'} {billingType}
						</Text>
					</Text>
					<Text>
						{' '}
						<Text color="clawd_body">{'\u25B8'}</Text> <Text dimColor={true}>Dir </Text>{' '}
						<Text>{cwdDisplay}</Text>
					</Text>
					<Text>
						{' '}
						<Text color="clawd_body">{'\u25A4'}</Text> <Text dimColor={true}>Memory </Text>{' '}
						{hasMd ? (
							<Text color="clawd_body">{'\u2713'} active</Text>
						) : (
							<Text dimColor={true}>{'\u2717'} none (try /cognitree-init)</Text>
						)}
					</Text>
				</Box>

				{/* System Section — hidden on short terminals so the welcome box
            fits between the status chrome and the prompt without scrolling. */}
				{rows >= 30 && (
					<>
						<Box marginTop={1}>
							<Text color="clawd_body" bold={true}>
								{makeDivider('\u25A0 System')}
							</Text>
						</Box>
						<Box flexDirection="column" paddingLeft={2} marginBottom={1}>
							<Text>
								{' '}
								<Text color="clawd_body">{'\u26A1'}</Text> <Text dimColor={true}>CPU </Text>{' '}
								<Text>{sysInfo.cpu}</Text> <Text dimColor={true}>({sysInfo.cpuCores} cores)</Text>
							</Text>
							<Text>
								{' '}
								<Text color="clawd_body">{'\u25A6'}</Text> <Text dimColor={true}>GPU </Text>{' '}
								<Text>{sysInfo.gpu}</Text>
							</Text>
							<Text>
								{' '}
								<Text color="clawd_body">{'\u25AB'}</Text> <Text dimColor={true}>Disk </Text>{' '}
								<Text>{storageStr}</Text>{' '}
								{storagePercent > 0 && <Text dimColor={true}>({storagePercent}% used)</Text>}
							</Text>
							<Text>
								{' '}
								<Text color="clawd_body">{'\u25D8'}</Text> <Text dimColor={true}>IP </Text>{' '}
								<Text>{sysInfo.ip}</Text>
							</Text>
						</Box>
					</>
				)}
			</Box>
		</OffscreenFreeze>
	)
}
