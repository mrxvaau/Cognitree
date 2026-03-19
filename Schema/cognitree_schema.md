# Cognitree — Data Schema v0.1
# This is the single source of truth for all data structures.
# Opus reads this before writing any code.

# ═══════════════════════════════════════════════════════
# FOLDER STRUCTURE
# ═══════════════════════════════════════════════════════

.cognitree/
  tree.json                     # full branch tree index
  active.json                   # currently active checkpoint
  checkpoints/
    cp_001/                     # each checkpoint is its own folder
      meta.json                 # id, parent, branch, depth, confidence
      goal.json                 # layer 01
      progress.json             # layer 02
      mistakes.json             # layer 03 — append only, never deleted
      blockers.json             # layer 04
      next.json                 # layer 05
      changed.json              # layer 06
      decisions.json            # layer 07
      warnings.json             # layer 08 — append only, never deleted
      prompt_state.json         # layer 09
      code.diff                 # file diffs from parent checkpoint
    cp_002/
      ...
    cp_008a/                    # branch checkpoint — naming: number + branch letter
      ...


# ═══════════════════════════════════════════════════════
# tree.json
# ═══════════════════════════════════════════════════════
# The full index of all checkpoints and branches.
# This is how Cognitree knows the shape of the entire tree.

{
  "project": "VoidRoom",
  "created": "2025-03-20T10:00:00Z",
  "total_checkpoints": 12,
  "checkpoints": {
    "cp_001": {
      "id": "cp_001",
      "parent": null,
      "branch": "trunk",
      "depth": 0,
      "is_base": true,
      "deleted": false,
      "timestamp": "2025-03-20T10:00:00Z"
    },
    "cp_008a": {
      "id": "cp_008a",
      "parent": "cp_007",
      "branch": "branch-a",
      "depth": 1,
      "is_base": false,
      "deleted": false,
      "timestamp": "2025-03-20T14:00:00Z"
    },
    "cp_010b": {
      "id": "cp_010b",
      "parent": "cp_009a",
      "branch": "branch-b",
      "depth": 2,
      "is_base": false,
      "deleted": false,
      "timestamp": "2025-03-20T15:00:00Z"
    }
  }
}

# RULES:
# - depth 0 = trunk
# - depth 1 = branch from trunk
# - depth 2 = branch from branch
# - depth N = unlimited nesting
# - deleted is false by default — only true if developer manually deletes
# - is_base = true every 10 checkpoints for efficient reconstruction


# ═══════════════════════════════════════════════════════
# active.json
# ═══════════════════════════════════════════════════════
# Tracks which checkpoint is currently loaded.
# Updated every time developer switches branch or advances.

{
  "checkpoint_id": "cp_010b",
  "branch": "branch-b",
  "switched_at": "2025-03-20T15:30:00Z"
}


# ═══════════════════════════════════════════════════════
# meta.json  (inside each checkpoint folder)
# ═══════════════════════════════════════════════════════

{
  "id": "cp_010b",
  "parent": "cp_009a",
  "branch": "branch-b",
  "depth": 2,
  "is_base": false,
  "confidence": 0.91,
  "prompt": "Add TTL index to messages collection",
  "timestamp": "2025-03-20T15:00:00Z",
  "deleted": false
}

# confidence score rules:
# - starts at 1.0 on every new branch
# - -0.15 for each new critical mistake
# - -0.08 for each new medium mistake
# - -0.03 for each new low mistake
# - -0.10 for each active blocker
# - +0.05 when a blocker is resolved
# - minimum 0.0, maximum 1.0
# - below 0.3 = branch flagged as unstable


# ═══════════════════════════════════════════════════════
# LAYER FILES
# ═══════════════════════════════════════════════════════
# Each layer file stores ONLY the delta from the parent checkpoint.
# Exception: cp_001 (root) and every is_base checkpoint store full state.
# To reconstruct full state at any checkpoint:
#   1. Find nearest ancestor where is_base = true
#   2. Walk forward applying each delta in order
#   3. Result = complete memory state at that checkpoint


# ── goal.json ──────────────────────────────────────────
# Layer 01 — Active objective for this session.
# Simple — only one goal at a time.

{
  "delta": true,
  "value": "Implement self-destructing messages with TTL expiry"
}

# When is_base = true, delta is false and value is the full current goal.


# ── progress.json ──────────────────────────────────────
# Layer 02 — What is already completed.
# Append-only array. Items never removed.

{
  "delta": true,
  "added": [
    {
      "id": "p_003",
      "text": "Message schema defined in /models/message.js",
      "checkpoint": "cp_010b",
      "timestamp": "2025-03-20T15:00:00Z"
    }
  ]
}


# ── mistakes.json ──────────────────────────────────────
# Layer 03 — What went wrong. PERMANENT. Never deleted.
# Hybrid: append-only + severity + status.

{
  "delta": true,
  "added": [
    {
      "id": "m_001",
      "text": "mongoose.findByIdAndDelete() does not exist",
      "fix": "use findOneAndDelete() instead",
      "file": "/models/message.js",
      "checkpoint": "cp_008a",
      "severity": "critical",
      "status": "resolved",
      "timestamp": "2025-03-20T14:00:00Z"
    }
  ],
  "updated": [
    {
      "id": "m_001",
      "status": "resolved"
    }
  ]
}

# severity values: "low" | "medium" | "critical"
# status values:  "active" | "resolved"
# updated array: only for status changes — never change text or fix


# ── blockers.json ──────────────────────────────────────
# Layer 04 — What is stuck or unresolved.

{
  "delta": true,
  "added": [
    {
      "id": "bl_001",
      "text": "TTL index on messages collection not yet confirmed working",
      "checkpoint": "cp_010b",
      "status": "active",
      "timestamp": "2025-03-20T15:00:00Z"
    }
  ],
  "updated": []
}

# status values: "active" | "resolved"


# ── next.json ──────────────────────────────────────────
# Layer 05 — The single immediate next step.
# Replaced entirely each checkpoint, not appended.

{
  "delta": true,
  "value": "Verify TTL index fires correctly with a test document"
}


# ── changed.json ───────────────────────────────────────
# Layer 06 — What was updated or refactored.
# Append-only log.

{
  "delta": true,
  "added": [
    {
      "id": "ch_002",
      "file": "/models/message.js",
      "description": "Added expiresAt field with TTL index",
      "checkpoint": "cp_010b",
      "timestamp": "2025-03-20T15:00:00Z"
    }
  ]
}


# ── decisions.json ─────────────────────────────────────
# Layer 07 — Why X was chosen over Y. Permanent rationale log.

{
  "delta": true,
  "added": [
    {
      "id": "d_002",
      "decision": "TTL index over cron job for message expiry",
      "reason": "TTL index is atomic and handled natively by MongoDB — no cron dependency",
      "alternatives": ["cron job", "application-level timer"],
      "checkpoint": "cp_010b",
      "timestamp": "2025-03-20T15:00:00Z"
    }
  ]
}


# ── warnings.json ──────────────────────────────────────
# Layer 08 — Caution areas. PERMANENT. Forwarded to every new branch.
# Same hybrid as mistakes: append-only + severity + status.

{
  "delta": true,
  "added": [
    {
      "id": "w_001",
      "text": "TTL index requires MongoDB background process to be running",
      "file": "/models/message.js",
      "checkpoint": "cp_009a",
      "severity": "medium",
      "status": "active",
      "timestamp": "2025-03-20T14:30:00Z"
    }
  ],
  "updated": []
}

# severity values: "low" | "medium" | "critical"
# status values:  "active" | "resolved"
# BRANCHING RULE: when a new branch is created, all warnings with
# status "active" from the failed branch are copied into the new
# branch's first checkpoint warnings.json as inherited entries.


# ── prompt_state.json ──────────────────────────────────
# Layer 09 — The AI's live cognitive state.
# Replaced entirely each checkpoint. Rebuilt from memory injection.

{
  "delta": false,
  "active_file": "/models/message.js",
  "active_function": "MessageSchema TTL index definition",
  "current_approach": "Using mongoose schema-level expireAfterSeconds index",
  "assumptions": [
    "MongoDB instance has background task runner enabled",
    "message documents have an expiresAt Date field"
  ],
  "checkpoint": "cp_010b"
}


# ═══════════════════════════════════════════════════════
# code.diff  (inside each checkpoint folder)
# ═══════════════════════════════════════════════════════
# Standard unified diff format.
# Stores only what changed from the parent checkpoint.
# Empty if no files changed this prompt.

--- a/models/message.js
+++ b/models/message.js
@@ -8,6 +8,10 @@
   content: { type: String, required: true },
   sender: { type: String, required: true },
   createdAt: { type: Date, default: Date.now },
+  expiresAt: {
+    type: Date,
+    index: { expireAfterSeconds: 0 }
+  }
 });


# ═══════════════════════════════════════════════════════
# MEMORY INJECTION BLOCK
# ═══════════════════════════════════════════════════════
# Built by the Context Injector before every prompt.
# Reconstructed by walking the ancestor chain of the active checkpoint.
# Only active + critical items injected. Low/resolved items summarized.

[COGNITREE — VoidRoom · cp_010b · branch-b · confidence 0.91]

GOAL:
  Implement self-destructing messages with TTL expiry

PROGRESS:
  - Auth routes complete (/api/auth.js)
  - Message schema defined (/models/message.js)
  - UI scaffolded (client/src/Chat.jsx)

NEXT:
  Verify TTL index fires correctly with a test document

CHANGED:
  - /models/message.js → added expiresAt field + TTL index (cp_010b)
  - /api/auth.js → refactored to JWT (cp_007)

DECISIONS:
  - TTL index over cron job — atomic, native MongoDB, no dependency (cp_010b)
  - JWT over sessions — stateless requirement (cp_007)

BLOCKERS:
  - TTL index on messages not yet confirmed working [active]

MISTAKES [critical]:
  - mongoose.findByIdAndDelete() does not exist → use findOneAndDelete() [resolved]

WARNINGS [medium · active]:
  - TTL index requires MongoDB background process running

PROMPT_STATE:
  - file: /models/message.js
  - approach: mongoose schema-level expireAfterSeconds
  - assuming: MongoDB background runner enabled

[/COGNITREE]

# INJECTION RULES:
# 1. critical mistakes — always injected regardless of status
# 2. medium/low mistakes — only if status is active
# 3. warnings critical/medium + active — always injected
# 4. warnings low + resolved — omitted unless relevant to current goal
# 5. progress — last 5 items only (avoid token bloat)
# 6. changed — last 5 files only
# 7. decisions — all injected (rationale is always relevant)
# 8. total injection block target: under 400 tokens


# ═══════════════════════════════════════════════════════
# BRANCH CREATION RULES
# ═══════════════════════════════════════════════════════
# When developer switches to checkpoint X and continues from there:
#
# 1. New branch ID assigned: branch-[next letter/number]
# 2. New checkpoint folder created as child of X
# 3. All active warnings from the abandoned branch copied
#    into new checkpoint's warnings.json as inherited entries
# 4. All critical mistakes from entire lineage carried forward
# 5. confidence resets to 1.0 on new branch
# 6. Original branch untouched — all its nodes remain intact
# 7. active.json updated to new checkpoint


# ═══════════════════════════════════════════════════════
# RECONSTRUCTION ALGORITHM
# ═══════════════════════════════════════════════════════
# To load full memory state at checkpoint cp_010b:
#
# 1. Read tree.json — find cp_010b ancestors:
#    cp_001 → cp_002 → ... → cp_007 → cp_009a → cp_010b
#
# 2. Find nearest is_base = true ancestor (e.g. cp_001)
#
# 3. Load cp_001 full layer files (delta: false)
#
# 4. Walk forward: cp_002, cp_003 ... cp_010b
#    For each checkpoint apply deltas:
#    - added arrays: append to full state
#    - updated arrays: find by id, update status only
#    - value replacements: overwrite (goal, next, prompt_state)
#
# 5. Result = complete memory state at cp_010b
#
# 6. Build injection block from reconstructed state
#    applying injection rules above
