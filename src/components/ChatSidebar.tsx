import { useState, useEffect, useRef, useLayoutEffect, memo, useCallback, useMemo, lazy, Suspense } from 'react';
import type { EmojiClickData, EmojiStyle } from 'emoji-picker-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Send, Check, X, LogIn, LogOut, Sparkles, PenLine, Pencil, Smile, SmilePlus } from 'lucide-react';
import {
  getUserColor,
  getUserId,
  formatMessageTime,
  formatRelativeTime,
  formatDateSeparator,
  isJumboEmojiMessage,
} from '@/lib/roomUtils';

// Lazy-load the picker so the ~80 KB chunk only hits the network
// when the user first opens the smiley popover. `preloadEmojiPicker`
// is called on smiley hover/focus to warm the chunk before click —
// subsequent calls are no-ops because the module is already cached.
const preloadEmojiPicker = () => import('emoji-picker-react');
const EmojiPicker = lazy(preloadEmojiPicker);

// Messenger's canonical reaction set — fixed, no picker needed.
const QUICK_REACTIONS = ['❤️', '😆', '😮', '😢', '😡', '👍'] as const;

interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system';
  created_at: string;
}

interface RoomMember {
  id: string;
  user_id: string;
  username: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string;
  emoji: string;
  created_at: string;
}

interface ChatSidebarProps {
  messages: Message[];
  members: RoomMember[];
  currentUsername: string;
  reactionsByMessage: Record<string, Reaction[]>;
  onSendMessage: (message: string) => void;
  onRename: (newName: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
  isOpen: boolean;
}

interface ProcessedMessage extends Message {
  formattedTime: string;
  userColor: string;
  isGrouped: boolean;
  isSelf: boolean;
  isJumbo: boolean;
  daySeparator: string | null;
}

const systemIconFor = (message: string) => {
  if (message.includes('joined')) return { Icon: LogIn, cls: 'sys-color-join' };
  if (message.includes('left')) return { Icon: LogOut, cls: 'sys-color-leave' };
  if (message.includes('is now')) return { Icon: PenLine, cls: 'sys-color-rename' };
  return { Icon: Sparkles, cls: 'sys-color-default' };
};

interface GroupedReaction {
  emoji: string;
  count: number;
  hasMine: boolean;
  reactions: Reaction[];
}

const groupReactions = (reactions: Reaction[] | undefined, currentUserId: string): GroupedReaction[] => {
  if (!reactions || reactions.length === 0) return [];
  const byEmoji = new Map<string, GroupedReaction>();
  for (const r of reactions) {
    const existing = byEmoji.get(r.emoji);
    if (existing) {
      existing.count += 1;
      existing.reactions.push(r);
      if (r.user_id === currentUserId) existing.hasMine = true;
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        hasMine: r.user_id === currentUserId,
        reactions: [r],
      });
    }
  }
  return Array.from(byEmoji.values());
};

interface MessageItemProps {
  msg: ProcessedMessage;
  reactions: Reaction[] | undefined;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
}

const MessageItem = memo(({ msg, reactions, currentUserId, onReact, onUnreact }: MessageItemProps) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Only one reactor-list popover at a time per message — track which
  // emoji's list is open (or null when nothing is open).
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);

  if (msg.message_type === 'system') {
    const { Icon, cls } = systemIconFor(msg.message);
    return (
      <div className="message message-system">
        <Icon className={`sys-lucide ${cls}`} />
        <span className="message-text-system">{msg.message}</span>
      </div>
    );
  }

  const groupedReactions = groupReactions(reactions, currentUserId);

  const handleRemoveMine = (emoji: string) => {
    onUnreact(msg.id, emoji);
    setOpenEmoji(null);
  };

  const handlePalettePick = (emoji: string) => {
    const hasMine = groupedReactions.find((g) => g.emoji === emoji)?.hasMine ?? false;
    if (hasMine) onUnreact(msg.id, emoji);
    else onReact(msg.id, emoji);
    setPaletteOpen(false);
  };

  const bubbleClass = msg.isJumbo
    ? 'msg-bubble-jumbo'
    : `msg-bubble ${msg.isSelf ? 'msg-bubble-self' : 'msg-bubble-other'}`;

  return (
    <div
      className={`message msg-row ${msg.isSelf ? 'msg-self' : 'msg-other'} ${msg.isGrouped ? 'msg-grouped' : ''}`}
    >
      {!msg.isSelf && !msg.isGrouped && (
        <div className="msg-avatar" style={{ backgroundColor: msg.userColor }}>
          {msg.username[0].toUpperCase()}
        </div>
      )}
      {!msg.isSelf && msg.isGrouped && <div className="msg-avatar-spacer" />}

      <div className="msg-bubble-wrap">
        <div className="msg-bubble-and-react">
          <div className={bubbleClass}>
            {!msg.isJumbo && !msg.isSelf && !msg.isGrouped && (
              <div className="msg-bubble-name" style={{ color: msg.userColor }}>{msg.username}</div>
            )}
            <span className="msg-bubble-text">{msg.message}</span>
          </div>
          <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="msg-react-btn"
                aria-label="Add reaction"
                title="Add reaction"
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="msg-react-palette"
              side="top"
              align={msg.isSelf ? 'end' : 'start'}
              sideOffset={6}
            >
              {QUICK_REACTIONS.map((emoji) => {
                const mine = groupedReactions.find((g) => g.emoji === emoji)?.hasMine ?? false;
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`msg-react-palette-btn ${mine ? 'is-mine' : ''}`}
                    onClick={() => handlePalettePick(emoji)}
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
        {groupedReactions.length > 0 && (
          <div className="msg-reactions-row">
            {groupedReactions.map((g) => (
              <Popover
                key={g.emoji}
                open={openEmoji === g.emoji}
                onOpenChange={(open) => setOpenEmoji(open ? g.emoji : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`msg-reaction-chip ${g.hasMine ? 'is-mine' : ''}`}
                    aria-label={`${g.count} ${g.emoji} reaction${g.count > 1 ? 's' : ''} — click to see who`}
                  >
                    <span className="msg-reaction-chip-emoji">{g.emoji}</span>
                    <span className="msg-reaction-chip-count">{g.count}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="msg-reactors-popover"
                  side="top"
                  align={msg.isSelf ? 'end' : 'start'}
                  sideOffset={6}
                >
                  <div className="msg-reactors-header">
                    <span className="msg-reactors-header-emoji">{g.emoji}</span>
                    <span className="msg-reactors-header-count">
                      {g.count} reaction{g.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="msg-reactors-list">
                    {g.reactions.map((r) => {
                      const mine = r.user_id === currentUserId;
                      return (
                        <li
                          key={r.id}
                          className={`msg-reactor-row ${mine ? 'msg-reactor-row-mine' : ''}`}
                        >
                          <span
                            className="msg-reactor-avatar"
                            style={{ backgroundColor: getUserColor(r.user_id) }}
                          >
                            {r.username[0].toUpperCase()}
                          </span>
                          <span className="msg-reactor-name">
                            {r.username}
                            {mine && <span className="msg-reactor-you"> (you)</span>}
                          </span>
                          {mine && (
                            <button
                              type="button"
                              className="msg-reactor-remove"
                              onClick={() => handleRemoveMine(g.emoji)}
                              aria-label="Remove your reaction"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </PopoverContent>
              </Popover>
            ))}
          </div>
        )}
        <span className="msg-bubble-time">{msg.formattedTime}</span>
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

export function ChatSidebar({
  messages,
  members,
  currentUsername,
  reactionsByMessage,
  onSendMessage,
  onRename,
  onReact,
  onUnreact,
  isOpen,
}: ChatSidebarProps) {
  const [messageText, setMessageText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUsername);
  const [isTyping, setIsTyping] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentUserId = useMemo(() => getUserId(), []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived: last chat message per user_id for preview + sort
  const lastActivityByUser = useMemo(() => {
    const out = new Map<string, { ts: string; preview: string }>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.message_type !== 'chat') continue;
      if (!out.has(m.user_id)) out.set(m.user_id, { ts: m.created_at, preview: m.message });
    }
    return out;
  }, [messages]);

  // Sort: self first, then by recent activity, then alphabetically.
  // Defensive: guarantee the current user appears even if the `members` prop is
  // stale or empty (initial subscription lag, transient realtime disconnect).
  const sortedMembers = useMemo(() => {
    const hasSelf = members.some((m) => m.user_id === currentUserId);
    const base: RoomMember[] = hasSelf
      ? [...members]
      : [
          ...members,
          {
            id: `self-${currentUserId}`,
            user_id: currentUserId,
            username: currentUsername,
          },
        ];
    return base.sort((a, b) => {
      if (a.user_id === currentUserId) return -1;
      if (b.user_id === currentUserId) return 1;
      const ta = lastActivityByUser.get(a.user_id)?.ts;
      const tb = lastActivityByUser.get(b.user_id)?.ts;
      if (ta && tb) return tb.localeCompare(ta);
      if (ta) return -1;
      if (tb) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [members, currentUsername, currentUserId, lastActivityByUser]);

  const processedMessages = useMemo<ProcessedMessage[]>(() => {
    let prevDay = '';
    return messages.map((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const isGrouped =
        prevMsg !== null &&
        prevMsg.user_id === msg.user_id &&
        prevMsg.message_type === 'chat' &&
        msg.message_type === 'chat' &&
        new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 120_000;

      const day = formatDateSeparator(msg.created_at);
      const daySeparator = day !== prevDay ? day : null;
      prevDay = day;

      return {
        ...msg,
        formattedTime: formatMessageTime(msg.created_at),
        userColor: getUserColor(msg.user_id),
        isGrouped: isGrouped && !daySeparator,
        isSelf: msg.user_id === currentUserId,
        isJumbo: msg.message_type === 'chat' && isJumboEmojiMessage(msg.message),
        daySeparator,
      };
    });
  }, [messages, currentUserId]);

  // Live-status tier derived from recency of the last chat message.
  // Drives both the dot color and the label ("LIVE NOW" vs "active Xm").
  const liveStatus = useMemo(() => {
    const lastChat = [...messages].reverse().find((m) => m.message_type === 'chat');
    if (!lastChat) {
      return { tier: 'idle' as const, label: 'quiet room', live: false };
    }
    const diff = Date.now() - new Date(lastChat.created_at).getTime();
    const rel = formatRelativeTime(lastChat.created_at);
    if (diff < 30_000)        return { tier: 'live' as const,   label: 'LIVE NOW',       live: true };
    if (diff < 2 * 60_000)    return { tier: 'active' as const, label: `active ${rel}`,  live: false };
    if (diff < 60 * 60_000)   return { tier: 'warm' as const,   label: `active ${rel}`,  live: false };
    return                         { tier: 'idle' as const,   label: `active ${rel}`,  live: false };
  }, [messages]);

  // Small bump animation on the listener chip whenever the roster grows.
  const prevMemberCountRef = useRef(sortedMembers.length);
  const [listenerBump, setListenerBump] = useState(false);
  useEffect(() => {
    const prev = prevMemberCountRef.current;
    prevMemberCountRef.current = sortedMembers.length;
    if (sortedMembers.length > prev) {
      setListenerBump(true);
      const t = window.setTimeout(() => setListenerBump(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [sortedMembers.length]);

  // Instant scroll — no animation race, no Radix, no scrollIntoView.
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Fallback scroll-based near-bottom check. The authoritative signal
  // is the IntersectionObserver on the bottom sentinel (see below) —
  // this is kept so the very first scrollToBottom during mount has a
  // reasonable default. Threshold widened from 80px to 200px so a
  // casual trackpad nudge doesn't unpin auto-scroll.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
  }, []);

  // After each DOM commit that added messages: scroll only when the user
  // was already near the bottom OR just sent a message themselves. If
  // they're scrolled up reading history, their position is preserved
  // and no toasts interrupt them.
  useLayoutEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (currentCount > prevCount && currentCount > 0) {
      if (justSentRef.current || isNearBottomRef.current) {
        scrollToBottom();
        justSentRef.current = false;
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messages, scrollToBottom]);

  // Authoritative "am I at the bottom?" signal. An IntersectionObserver
  // on an invisible sentinel at the end of the list reports reliably
  // whether the bottom is in view, regardless of whether scroll events
  // fire (they don't fire when content grows without user interaction,
  // which is what left isNearBottomRef stale over long sessions).
  // A `rootMargin` of 200px means "still counts as bottom if within
  // 200px" — matches the scroll fallback threshold.
  useEffect(() => {
    const root = scrollContainerRef.current;
    const target = bottomSentinelRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        isNearBottomRef.current = entry.isIntersecting;
      },
      { root, threshold: 0, rootMargin: '0px 0px 200px 0px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  // Re-pin to bottom when layout settles after the initial load.
  // useLayoutEffect's scrollHeight snapshot can be stale because Google
  // Fonts (Press Start 2P, Inter) load asynchronously — after the swap,
  // every bubble's text metrics change and scrollHeight grows, leaving
  // the previous scrollTop stranded partway through history. A
  // ResizeObserver on the scroll content catches that (and any other
  // late layout change) and re-pins — but only while the user hasn't
  // scrolled up to read history.
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    const content = scrollEl.firstElementChild;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (isNearBottomRef.current) scrollToBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // Belt-and-suspenders for the font-swap race: fire one final re-pin
  // once webfonts are fully ready, in case the ResizeObserver missed
  // the settling frame.
  useEffect(() => {
    if (!('fonts' in document)) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      if (isNearBottomRef.current) scrollToBottom();
    });
    return () => {
      cancelled = true;
    };
  }, [scrollToBottom]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setMessageText(value);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim().length > 0) {
      setIsTyping(true);
      typingTimerRef.current = setTimeout(() => setIsTyping(false), 600);
    } else {
      setIsTyping(false);
    }
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;
    justSentRef.current = true;
    onSendMessage(messageText);
    setMessageText('');
    setIsTyping(false);
  }, [messageText, onSendMessage]);

  const insertEmoji = useCallback((emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const input = inputRef.current;
    const start = input?.selectionStart ?? messageText.length;
    const end = input?.selectionEnd ?? messageText.length;
    const next = messageText.slice(0, start) + emoji + messageText.slice(end);
    setMessageText(next);
    // Restore focus + place caret after the inserted emoji on the next frame,
    // after React has committed the new value.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, [messageText]);

  const handleRename = useCallback(() => {
    if (!newName.trim() || newName === currentUsername) {
      setIsEditingName(false);
      setNewName(currentUsername);
      return;
    }
    onRename(newName);
    setIsEditingName(false);
  }, [newName, currentUsername, onRename]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  const charCount = messageText.length;
  const showCounter = charCount > 180;

  return (
    <div
      className={`chat-sidebar ${isOpen ? '' : 'chat-sidebar-closed'}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      {/* Brand header */}
      <header className="chat-header-pixel">
        <div className="chat-header-row">
          <div className="chat-header-title">
            <span className="chat-brand-sun" aria-hidden="true">
              <span className="sun-core" />
              <span className="sun-ray sun-ray-n" />
              <span className="sun-ray sun-ray-ne" />
              <span className="sun-ray sun-ray-e" />
              <span className="sun-ray sun-ray-se" />
              <span className="sun-ray sun-ray-s" />
              <span className="sun-ray sun-ray-sw" />
              <span className="sun-ray sun-ray-w" />
              <span className="sun-ray sun-ray-nw" />
            </span>
            <span>CHILL CORNER</span>
          </div>
          <div
            className={`chat-header-listeners ${listenerBump ? 'chat-header-listeners-bump' : ''}`}
            title={`${sortedMembers.length} listening`}
          >
            <span className="chat-header-eq" aria-hidden="true">
              <span className="chat-header-eq-bar" />
              <span className="chat-header-eq-bar" />
              <span className="chat-header-eq-bar" />
            </span>
            <span className="chat-header-listeners-avatars" aria-hidden="true">
              {sortedMembers.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  className="chat-header-listeners-avatar"
                  style={{ backgroundColor: getUserColor(m.user_id) }}
                  title={m.username}
                />
              ))}
            </span>
            <span className="chat-header-listeners-count">
              {sortedMembers.length}
              {sortedMembers.length > 3 && <span className="chat-header-listeners-plus">+</span>}
            </span>
          </div>
        </div>
        <div
          className={`chat-header-subline chat-header-live chat-header-live-${liveStatus.tier}`}
          aria-live="polite"
        >
          <span className="chat-header-live-dot" aria-hidden="true" />
          <span className={liveStatus.live ? 'chat-header-live-label-bold' : 'chat-header-live-label'}>
            {liveStatus.label}
          </span>
        </div>
      </header>

      {/* Members section — minimal pixel chip grid */}
      <section className="members-section">
        <div className="section-label-row">
          <span className="section-label">
            In the room
            <span className="section-label-count">· {sortedMembers.length}</span>
          </span>
          <button
            className="section-rename-btn"
            onClick={() => {
              setIsEditingName(true);
              setNewName(currentUsername);
            }}
            title="Rename yourself"
            aria-label="Rename yourself"
            type="button"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        {isEditingName && (
          <div className="section-rename-row">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingName(false);
                  setNewName(currentUsername);
                }
              }}
              className="member-name-input"
              autoFocus
            />
            <button className="member-name-confirm" onClick={handleRename} title="Save (Enter)" type="button">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              className="member-name-cancel"
              onClick={() => {
                setIsEditingName(false);
                setNewName(currentUsername);
              }}
              title="Cancel (Esc)"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="members-list">
          {sortedMembers.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const color = getUserColor(member.user_id);
            const activity = lastActivityByUser.get(member.user_id);
            const justSpoke = activity
              ? Date.now() - new Date(activity.ts).getTime() < 4_000
              : false;

            return (
              <div
                key={member.id}
                className={`member-row ${isSelf ? 'member-row-self' : ''} ${justSpoke ? 'member-row-speaking' : ''}`}
                title={isSelf ? `${member.username} (you)` : member.username}
                aria-label={isSelf ? `${member.username}, you` : member.username}
              >
                <span className="member-row-avatar" style={{ backgroundColor: color }}>
                  {member.username[0].toUpperCase()}
                </span>
                <span className="member-row-name">{member.username}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Messages area */}
      <div className="messages-section">
        <div
          className="messages-scroll"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div className="messages-list">
            {processedMessages.length === 0 && (
              <div className="chat-empty-state">
                <div className="pixel-cat" aria-hidden="true" />
                <p>No messages yet</p>
                <p className="chat-empty-hint">Say hi to start the conversation</p>
              </div>
            )}
            {processedMessages.map((msg) => (
              <div key={msg.id}>
                {msg.daySeparator && (
                  <div className="date-separator" aria-label={msg.daySeparator}>
                    <span className="date-separator-chip">{msg.daySeparator}</span>
                  </div>
                )}
                <MessageItem
                  msg={msg}
                  reactions={reactionsByMessage[msg.id]}
                  currentUserId={currentUserId}
                  onReact={onReact}
                  onUnreact={onUnreact}
                />
              </div>
            ))}
            <div ref={bottomSentinelRef} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="chat-input-section">
        <div className="chat-composer-typing" aria-live="polite">
          {isTyping ? 'pressing keys…' : ''}
        </div>
        <div className="chat-input-wrapper">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="chat-emoji-btn"
                aria-label="Open emoji picker"
                title="Emoji"
                onMouseEnter={preloadEmojiPicker}
                onFocus={preloadEmojiPicker}
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="chat-emoji-popover"
            >
              <Suspense fallback={<div className="chat-emoji-loading">Loading…</div>}>
                <EmojiPicker
                  onEmojiClick={insertEmoji}
                  autoFocusSearch={false}
                  lazyLoadEmojis
                  emojiStyle={'native' as EmojiStyle}
                  previewConfig={{ showPreview: false }}
                  width={320}
                  height={360}
                />
              </Suspense>
            </PopoverContent>
          </Popover>
          <Input
            ref={inputRef}
            type="text"
            placeholder="Message the room…"
            value={messageText}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="chat-input-field"
            aria-label="Message input"
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            type="button"
            className="chat-send-button"
            disabled={!messageText.trim()}
            title="Send message (Enter)"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {showCounter && (
          <div className="chat-composer-counter">{charCount} chars</div>
        )}
      </div>
    </div>
  );
}
