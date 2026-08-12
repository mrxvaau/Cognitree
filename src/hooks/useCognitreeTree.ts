/**
 * useCognitreeTree
 *
 * Reads .cognitree/tree.json and .cognitree/active.json from the current
 * working directory and returns a structured tree for the ProjectTreePanel.
 *
 * Refreshes every 2 seconds so the tree stays live when branches are
 * created/switched from the CLI without requiring a full process restart.
 */

import * as fs from 'fs'
import * as path from 'path'
import { useEffect, useRef, useState } from 'react'
import type { ActiveJson, CheckpointMeta, TreeEntry, TreeJson } from '../cognitree/types.js'
import { getCwd } from '../utils/cwd.js'

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface TreeNodeData {
  id: string
  label: string           // branch or short checkpoint id
  branch: string
  depth: number
  isBase: boolean
  isActive: boolean
  isFallback: boolean     // true if branch name includes "fallback" or "backup"
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
// FILE READING
// ═══════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════
// TREE BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildTree(
  treeJson: TreeJson,
  activeJson: ActiveJson,
  cognitreeDir: string,
): TreeNodeData[] {
  const entries = Object.values(treeJson.checkpoints).filter(e => !e.deleted)
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

// ═══════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════

const POLL_MS = 500   // fast enough to feel live (new cp appears in <1 frame)

export function useCognitreeTree(): CognitreeTreeState {
  const [state, setState] = useState<CognitreeTreeState>({
    tree: null,
    activeCheckpointId: null,
    activeBranch: null,
    project: null,
    totalCheckpoints: 0,
    isLoaded: false,
    error: null,
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function load(): void {
    try {
      const cwd = getCwd()
      const cognitreeDir = path.join(cwd, '.cognitree')

      if (!fs.existsSync(cognitreeDir)) {
        setState({
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

      const treeJson = readJson<TreeJson>(path.join(cognitreeDir, 'tree.json'))
      const activeJson = readJson<ActiveJson>(path.join(cognitreeDir, 'active.json'))

      if (!treeJson || !activeJson) {
        setState(prev => ({
          ...prev,
          isLoaded: true,
          error: 'tree.json or active.json missing',
        }))
        return
      }

      const tree = buildTree(treeJson, activeJson, cognitreeDir)

      setState({
        tree,
        activeCheckpointId: activeJson.checkpoint_id,
        activeBranch: activeJson.branch,
        project: treeJson.project ?? null,
        totalCheckpoints: treeJson.total_checkpoints,
        isLoaded: true,
        error: null,
      })
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoaded: true,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  useEffect(() => {
    load()

    function schedule(): void {
      timerRef.current = setTimeout(() => {
        load()
        schedule()
      }, POLL_MS)
    }
    schedule()

    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
