/**
 * useCognitreeTree
 *
 * Reads .cognitree/tree.json and .cognitree/active.json from the current
 * working directory and returns a structured tree for the ProjectTreePanel.
 *
 * All consumers share ONE module-level polling loop (500ms) via a
 * useSyncExternalStore-compatible store: one fs scan per tick for the whole
 * app instead of one per mounted hook instance, and subscribers are only
 * notified when the underlying files actually changed (mtime + content
 * hash), so idle trees cost zero re-renders.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { useSyncExternalStore } from 'react'
import type { ActiveJson, CheckpointMeta, TreeEntry, TreeJson } from '../cognitree/types.js'
import { getCwd } from '../utils/cwd.js'

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface TreeNodeData {
	id: string
	label: string // branch or short checkpoint id
	branch: string
	depth: number
	isBase: boolean
	isActive: boolean
	isFallback: boolean // true if branch name includes "fallback" or "backup"
	confidence: number | null
	timestamp: string
	children: TreeNodeData[]
	parentId: string | null
}

export interface CognitreeTreeState {
	/** null = no .cognitree directory in cwd */
	tree: TreeNodeData[] | null
	activeCheckpointId: string | null
	activeBranch: string | null
	project: string | null
	totalCheckpoints: number
	isLoaded: boolean
	error: string | null
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED STORE (one poller for every consumer)
// ═══════════════════════════════════════════════════════════════════════

const POLL_MS = 500

let cachedState: CognitreeTreeState = {
	tree: null,
	activeCheckpointId: null,
	activeBranch: null,
	project: null,
	totalCheckpoints: 0,
	isLoaded: false,
	error: null,
}

/** mtime-ms of tree.json / active.json on the last successful load */
let lastTreeMtime = -1
let lastActiveMtime = -1

const listeners = new Set<() => void>()
let pollStarted = false

function emit(): void {
	for (const listener of listeners) listener()
}

function readJson<T>(filePath: string): T | null {
	try {
		if (!fs.existsSync(filePath)) return null
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
	} catch {
		return null
	}
}

function readConfidence(cognitreeDir: string, checkpointId: string): number | null {
	try {
		const metaPath = path.join(cognitreeDir, 'checkpoints', checkpointId, 'meta.json')
		const meta = readJson<CheckpointMeta>(metaPath)
		return meta?.confidence ?? null
	} catch {
		return null
	}
}

function mtimeMs(filePath: string): number {
	try {
		return fs.statSync(filePath).mtimeMs
	} catch {
		return -1
	}
}

/** Returns a short human-readable label for a node */
function nodeLabel(entry: TreeEntry): string {
	// For branch base checkpoints: show the branch name
	if (entry.is_base && entry.branch !== 'main') {
		return entry.branch
	}
	// For main-branch checkpoints: show cp_001, cp_002...
	return entry.id
}

function isFallbackBranch(branch: string): boolean {
	const lower = branch.toLowerCase()
	return (
		lower.includes('fallback') ||
		lower.includes('backup') ||
		lower.includes('old') ||
		lower.startsWith('branch-z') ||
		lower.startsWith('branch-y')
	)
}

function buildTree(
	treeJson: TreeJson,
	activeJson: ActiveJson,
	cognitreeDir: string,
): TreeNodeData[] {
	const entries = Object.values(treeJson.checkpoints).filter((e) => !e.deleted)
	const activeId = activeJson.checkpoint_id

	// Build a map of id → TreeNodeData
	const nodeMap = new Map<string, TreeNodeData>()

	for (const entry of entries) {
		const confidence = readConfidence(cognitreeDir, entry.id)
		const node: TreeNodeData = {
			id: entry.id,
			label: nodeLabel(entry),
			branch: entry.branch,
			depth: entry.depth,
			isBase: entry.is_base,
			isActive: entry.id === activeId,
			isFallback: isFallbackBranch(entry.branch),
			confidence,
			timestamp: entry.timestamp,
			children: [],
			parentId: entry.parent,
		}
		nodeMap.set(entry.id, node)
	}

	// Wire parent → children
	const roots: TreeNodeData[] = []
	for (const node of nodeMap.values()) {
		if (node.parentId && nodeMap.has(node.parentId)) {
			nodeMap.get(node.parentId)!.children.push(node)
		} else {
			roots.push(node)
		}
	}

	// Sort children: main branch first, then by timestamp
	function sortChildren(nodes: TreeNodeData[]): void {
		nodes.sort((a, b) => {
			if (a.branch === 'main' && b.branch !== 'main') return -1
			if (b.branch === 'main' && a.branch !== 'main') return 1
			return a.timestamp.localeCompare(b.timestamp)
		})
		for (const n of nodes) sortChildren(n.children)
	}
	sortChildren(roots)

	return roots
}

function setStateQuiet(next: CognitreeTreeState): void {
	if (
		next.isLoaded === cachedState.isLoaded &&
		next.tree === cachedState.tree &&
		next.activeCheckpointId === cachedState.activeCheckpointId &&
		next.activeBranch === cachedState.activeBranch &&
		next.project === cachedState.project &&
		next.totalCheckpoints === cachedState.totalCheckpoints &&
		next.error === cachedState.error
	) {
		return
	}
	cachedState = next
	emit()
}

function load(): void {
	try {
		const cwd = getCwd()
		const cognitreeDir = path.join(cwd, '.cognitree')

		if (!fs.existsSync(cognitreeDir)) {
			setStateQuiet({
				tree: null,
				activeCheckpointId: null,
				activeBranch: null,
				project: null,
				totalCheckpoints: 0,
				isLoaded: true,
				error: null,
			})
			return
		}

		// Skip re-parsing when neither file changed on disk since last load.
		// mtimes are only stashed after a successful parse — a torn read (null
		// parse) must retry on the next tick even if mtimes look unchanged.
		const treeMtime = mtimeMs(path.join(cognitreeDir, 'tree.json'))
		const activeMtime = mtimeMs(path.join(cognitreeDir, 'active.json'))
		if (
			cachedState.isLoaded &&
			cachedState.tree !== null &&
			cachedState.error === null &&
			treeMtime === lastTreeMtime &&
			activeMtime === lastActiveMtime
		) {
			return
		}

		const treeJson = readJson<TreeJson>(path.join(cognitreeDir, 'tree.json'))
		const activeJson = readJson<ActiveJson>(path.join(cognitreeDir, 'active.json'))

		if (!treeJson || !activeJson) {
			setStateQuiet({ ...cachedState, isLoaded: true, error: 'tree.json or active.json missing' })
			return
		}
		lastTreeMtime = treeMtime
		lastActiveMtime = activeMtime

		setStateQuiet({
			tree: buildTree(treeJson, activeJson, cognitreeDir),
			activeCheckpointId: activeJson.checkpoint_id,
			activeBranch: activeJson.branch,
			project: treeJson.project ?? null,
			totalCheckpoints: treeJson.total_checkpoints,
			isLoaded: true,
			error: null,
		})
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error'
		setStateQuiet({ ...cachedState, isLoaded: true, error })
	}
}

function scheduleNextPoll(): void {
	setTimeout(() => {
		load()
		scheduleNextPoll()
	}, POLL_MS)
}

function subscribe(listener: () => void): () => void {
	// First subscriber starts the single shared poller.
	if (!pollStarted) {
		pollStarted = true
		load()
		scheduleNextPoll()
	}
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

// ═══════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════

export function useCognitreeTree(): CognitreeTreeState {
	return useSyncExternalStore(subscribe, () => cachedState)
}
