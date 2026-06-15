import * as React from "react"
import { cn } from "@/lib/utils"

// ── Base shimmer skeleton ─────────────────────────────────────────────────────

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Base shimmer block — compose these to match the content shape */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      className={cn(
        "rounded-md animate-shimmer bg-[length:200%_100%]",
        "bg-gradient-to-r from-surface-800 via-surface-700 to-surface-800",
        className
      )}
      {...props}
    />
  )
}

// ── Convenience shapes ────────────────────────────────────────────────────────

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Skeleton
      className={cn("rounded-full flex-shrink-0", className)}
      style={{ width: size, height: size }}
    />
  )
}

// ── Conversation-specific shapes ──────────────────────────────────────────────

/** Single conversation list item skeleton */
export function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  )
}

/** Single message skeleton — mimics a MessageBubble shape */
export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      {/* Bubble */}
      <div className={cn("flex flex-col gap-2 flex-1 max-w-md", isUser && "items-end")}>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  )
}

/** Multiple message skeletons for initial conversation load */
export function ConversationLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto px-4 py-6">
      <MessageSkeleton />
      <MessageSkeleton isUser />
      <MessageSkeleton />
      <MessageSkeleton isUser />
      <MessageSkeleton />
    </div>
  )
}

/** Animated "waiting for first token" streaming placeholder */
export function StreamingCursor() {
  return (
    <span
      className="inline-block w-2 h-4 bg-brand-400 ml-0.5 align-middle"
      style={{
        animation: "streaming-cursor 1s steps(1) infinite",
      }}
      aria-hidden
    />
  )
}
