import type { LiveRoomType, LiveTopic, ViolationCode } from '@/types/liveRooms'

/** How the ten topics read on screen (plan.md Live §5.1). */
export const TOPIC_LABELS: Readonly<Record<LiveTopic, string>> = {
  TECH: 'Tech',
  MUSIC: 'Music',
  TALK: 'Talk',
  GAMING: 'Gaming',
  BUSINESS: 'Business',
  CHIT_CHAT: 'Chit-chat',
  ENTERTAINMENT: 'Entertainment',
  EDUCATION: 'Education',
  LIFESTYLE: 'Lifestyle',
  OTHER: 'Other',
}

export const TYPE_LABELS: Readonly<Record<LiveRoomType, string>> = {
  AUDIO: 'Audio',
  VIDEO: 'Video',
}

export const SORT_LABELS = { recent: 'Newest first', viewers: 'Most viewers' } as const

/** An unknown topic from the server is shown humanised, never dropped. */
export function topicLabel(topic: string | null | undefined): string | null {
  if (!topic) return null
  return (
    (TOPIC_LABELS as Record<string, string>)[topic] ??
    topic.charAt(0) + topic.slice(1).toLowerCase().replaceAll('_', ' ')
  )
}

export function typeLabel(type: string): string {
  return (TYPE_LABELS as Record<string, string>)[type] ?? type
}

/** The six violation codes, as the Warn dialog and the moderation log show them. */
export const VIOLATION_LABELS: Readonly<Record<ViolationCode, string>> = {
  COMMUNITY_GUIDELINES: 'Community guidelines',
  INAPPROPRIATE_CONTENT: 'Inappropriate content',
  COPYRIGHT_INFRINGEMENT: 'Copyright',
  HARASSMENT_HATE_SPEECH: 'Harassment / hate speech',
  FRAUD_SPAM: 'Fraud / spam',
  OTHER: 'Other',
}
