import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import type { EmojiClickData, EmojiStyle } from 'emoji-picker-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Send, Check, X, Pencil, Smile, Zap } from 'lucide-react';
import {
  getUserColor,
  getUserId,
  formatMessageTime,
  formatRelativeTime,
  formatDateSeparator,
  isJumboEmojiMessage,
  playBuzzSound,
} from '@/lib/roomUtils';
import { useChatScroll } from './chat/useChatScroll';
import { MessageItem, type ProcessedMessage } from './chat/MessageItem';
import { groupReactions } from './chat/MessageReactions';

// Lazy-load the picker so the ~80 KB chunk only hits the network
// when the user first opens the smiley popover. `preloadEmojiPicker`
// is called on smiley hover/focus to warm the chunk before click —
// subsequent calls are no-ops because the module is already cached.
const preloadEmojiPicker = () => import('emoji-picker-react');
const EmojiPicker = lazy(preloadEmojiPicker);

interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system' | 'buzz';
  created_at: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_message?: string | null;
}

const BUZZ_COOLDOWN_MS = 5000;
const BUZZ_FRESHNESS_MS = 5000;

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
  onSendMessage: (message: string, replyTo: Message | null) => void;
  onRename: (newName: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
  onBuzz: () => void | Promise<void>;
  isOpen: boolean;
}


export function ChatSidebar({
  messages,
  members,
  currentUsername,
  reactionsByMessage,
  onSendMessage,
  onRename,
  onReact,
  onUnreact,
  onBuzz,
  isOpen,
}: ChatSidebarProps) {
  const [messageText, setMessageText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUsername);
  const [isTyping, setIsTyping] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [buzzCooldown, setBuzzCooldown] = useState(0);
  const buzzCooldownTimerRef = useRef<number | null>(null);
  const reactedBuzzIdsRef = useRef<Set<string>>(new Set());

  const currentUserId = useMemo(() => getUserId(), []);

  const inputRef = useRef<HTMLInputElement>(null);
  const justSentRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { scrollContainerRef, bottomSentinelRef, handleScroll } = useChatScroll({
    messagesLength: messages.length,
    justSentRef,
  });

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

  // Pre-compute every per-message thing once per render here, including
  // groupedReactions — previously this ran inside MessageItem on every
  // re-render of every item, which scaled badly when reactions arrived.
  const processedMessages = useMemo<ProcessedMessage[]>(() => {
    let prevDay = '';
    return messages.map((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const hasReply = !!msg.reply_to_id || !!msg.reply_to_message;
      const isGrouped =
        prevMsg !== null &&
        prevMsg.user_id === msg.user_id &&
        prevMsg.message_type === 'chat' &&
        msg.message_type === 'chat' &&
        !hasReply &&
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
        // Quote cards own the visual weight — don't also jumbo-ify the text.
        isJumbo: !hasReply && msg.message_type === 'chat' && isJumboEmojiMessage(msg.message),
        daySeparator,
        groupedReactions: groupReactions(reactionsByMessage[msg.id], currentUserId),
      };
    });
  }, [messages, currentUserId, reactionsByMessage]);

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
    onSendMessage(messageText, replyTo);
    setMessageText('');
    setReplyTo(null);
    setIsTyping(false);
  }, [messageText, onSendMessage, replyTo]);

  const handleBuzzClick = useCallback(() => {
    if (Date.now() < buzzCooldown) return;
    const nextReady = Date.now() + BUZZ_COOLDOWN_MS;
    setBuzzCooldown(nextReady);
    if (buzzCooldownTimerRef.current) window.clearTimeout(buzzCooldownTimerRef.current);
    buzzCooldownTimerRef.current = window.setTimeout(() => setBuzzCooldown(0), BUZZ_COOLDOWN_MS);
    void onBuzz();
  }, [buzzCooldown, onBuzz]);

  // Ctrl+G / Cmd+G → buzz, matching Yahoo! Messenger's muscle memory.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        handleBuzzClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleBuzzClick]);

  useEffect(() => () => {
    if (buzzCooldownTimerRef.current) window.clearTimeout(buzzCooldownTimerRef.current);
  }, []);

  // Receive buzzes: detect new buzz messages from other users and shake
  // the room + play a buzzer. Freshness gate (5 s) prevents the initial
  // 50-message replay from re-triggering shakes for historical buzzes.
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.message_type !== 'buzz') continue;
      if (m.user_id === currentUserId) continue;
      if (reactedBuzzIdsRef.current.has(m.id)) return;
      reactedBuzzIdsRef.current.add(m.id);
      const age = Date.now() - new Date(m.created_at).getTime();
      if (age > BUZZ_FRESHNESS_MS) return;

      const reducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const room = document.querySelector<HTMLElement>('.room-page');
      if (room && !reducedMotion) {
        room.classList.remove('room-buzzing');
        // Force reflow so a second buzz in quick succession replays cleanly.
        void room.offsetWidth;
        room.classList.add('room-buzzing');
        window.setTimeout(() => room.classList.remove('room-buzzing'), 900);
      }
      playBuzzSound();
      return;
    }
  }, [messages, currentUserId]);

  const handleReplyRequest = useCallback((target: Message) => {
    setReplyTo(target);
    // Focus the input on the next frame so the keyboard is ready.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Scroll the quoted parent into view and briefly flash it. No-op if
  // the parent has rolled off the 50-message window (the quote card
  // still renders from the denormalized snapshot).
  const jumpToMessage = useCallback((messageId: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const row = target.querySelector<HTMLElement>('.msg-row') ?? target;
    row.classList.remove('msg-row-flash');
    // Force a reflow so the animation can replay if the same target
    // is clicked twice in a row.
    void row.offsetWidth;
    row.classList.add('msg-row-flash');
    window.setTimeout(() => row.classList.remove('msg-row-flash'), 1300);
  }, []);

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
              <div key={msg.id} data-message-id={msg.id}>
                {msg.daySeparator && (
                  <div className="date-separator" aria-label={msg.daySeparator}>
                    <span className="date-separator-chip">{msg.daySeparator}</span>
                  </div>
                )}
                <MessageItem
                  msg={msg}
                  currentUserId={currentUserId}
                  onReact={onReact}
                  onUnreact={onUnreact}
                  onReplyRequest={handleReplyRequest}
                  onJumpToMessage={jumpToMessage}
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
        {replyTo && (
          <div className="chat-reply-banner" role="status">
            <div className="chat-reply-banner-accent" />
            <div className="chat-reply-banner-body">
              <div className="chat-reply-banner-label">
                Replying to{' '}
                <span
                  className="chat-reply-banner-name"
                  style={{ color: getUserColor(replyTo.user_id) }}
                >
                  {replyTo.user_id === currentUserId ? 'yourself' : replyTo.username}
                </span>
              </div>
              <div className="chat-reply-banner-snippet">{replyTo.message}</div>
            </div>
            <button
              type="button"
              className="chat-reply-banner-close"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              title="Cancel reply (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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
              } else if (e.key === 'Escape' && replyTo) {
                e.preventDefault();
                setReplyTo(null);
              }
            }}
            className="chat-input-field"
            aria-label="Message input"
          />
          <button
            type="button"
            className={`chat-buzz-btn ${buzzCooldown > 0 ? 'is-cooling' : ''}`}
            onClick={handleBuzzClick}
            disabled={buzzCooldown > 0}
            aria-label="Buzz the room"
            title={buzzCooldown > 0 ? 'Cooling down…' : 'Buzz the room (Ctrl+G)'}
          >
            <Zap className="h-4 w-4" />
          </button>
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
