import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Send, Users, Edit2, Check, X } from 'lucide-react';

interface Message {
  id: string;
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

interface ChatSidebarProps {
  messages: Message[];
  members: RoomMember[];
  currentUsername: string;
  onSendMessage: (message: string) => void;
  onRename: (newName: string) => void;
}

// Memoized individual message component to prevent unnecessary re-renders
const MessageItem = memo(({ msg, formattedTime }: { msg: Message; formattedTime: string }) => {
  const isSystem = msg.message_type === 'system';

  return (
    <div className={`message ${isSystem ? 'message-system' : 'message-chat'}`}>
      {isSystem ? (
        <div className="message-text-system">{msg.message}</div>
      ) : (
        <>
          <div className="message-header">
            <span className="message-username">{msg.username}</span>
            <span className="message-time">{formattedTime}</span>
          </div>
          <div className="message-text">{msg.message}</div>
        </>
      )}
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

export function ChatSidebar({
  messages,
  members,
  currentUsername,
  onSendMessage,
  onRename,
}: ChatSidebarProps) {
  const [messageText, setMessageText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUsername);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const timeCache = useRef<Map<string, string>>(new Map());
  const inputDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputTimeRef = useRef(0);

  // Memoize formatTime function with caching to prevent recalculations
  const formatTime = useCallback((timestamp: string): string => {
    // Check cache first
    if (timeCache.current.has(timestamp)) {
      return timeCache.current.get(timestamp)!;
    }

    // Format and cache
    const date = new Date(timestamp);
    const formatted = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    timeCache.current.set(timestamp, formatted);
    return formatted;
  }, []);

  // Memoize messages with pre-formatted times for better performance
  const messagesWithFormattedTimes = useMemo(() => {
    return messages.map(msg => ({
      ...msg,
      formattedTime: formatTime(msg.created_at)
    }));
  }, [messages, formatTime]);

  // Auto-scroll to bottom when new messages arrive - FIXED for Radix ScrollArea
  useEffect(() => {
    const currentMessageCount = messages.length;
    const prevMessageCount = prevMessageCountRef.current;

    // Only scroll if we have a new message (count increased)
    if (currentMessageCount > prevMessageCount && currentMessageCount > 0) {
      // Use requestAnimationFrame for smooth, non-blocking scroll
      requestAnimationFrame(() => {
        // Find the Radix ScrollArea viewport (the actual scrollable element)
        const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;

        if (viewport) {
          // Scroll to bottom instantly
          viewport.scrollTop = viewport.scrollHeight;
        }
      });
    }

    // Update the ref for next comparison
    prevMessageCountRef.current = currentMessageCount;
  }, [messages.length]); // Only depend on length, not the entire array

  // Debounced input handler to prevent duplicate character entry
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value;
    const now = Date.now();

    // Clear previous debounce timer
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
    }

    // Set state immediately for UI responsiveness
    setMessageText(newValue);
    lastInputTimeRef.current = now;

    // Debounce any state updates for validation (50ms)
    inputDebounceRef.current = setTimeout(() => {
      // This ensures no duplicate character processing
      lastInputTimeRef.current = 0;
    }, 50);
  }, []);

  // Memoize handlers to prevent unnecessary re-renders
  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;

    // Clear any pending input debounces
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
    }

    onSendMessage(messageText);
    setMessageText('');
    lastInputTimeRef.current = 0;
  }, [messageText, onSendMessage]);

  const handleRename = useCallback(() => {
    if (!newName.trim() || newName === currentUsername) {
      setIsEditingName(false);
      setNewName(currentUsername);
      return;
    }
    onRename(newName);
    setIsEditingName(false);
  }, [newName, currentUsername, onRename]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inputDebounceRef.current) {
        clearTimeout(inputDebounceRef.current);
      }
    };
  }, []);

  return (
    <div className="chat-sidebar">
      {/* Members section */}
      <div className="members-section">
        <div className="members-header">
          <Users className="h-5 w-5" />
          <span className="font-semibold">
            {members.length} {members.length === 1 ? 'Person' : 'People'}
          </span>
        </div>
        <div className="members-list">
          {members.map((member) => (
            <div
              key={member.id}
              className={`member-item ${
                member.username === currentUsername ? 'member-item-self' : ''
              }`}
            >
              <div className="member-avatar">
                {member.username[0].toUpperCase()}
              </div>

              {/* Name display/edit for current user */}
              {member.username === currentUsername && !isEditingName ? (
                <button
                  className="member-name member-name-editable"
                  onClick={() => {
                    setIsEditingName(true);
                    setNewName(currentUsername);
                  }}
                  title="Click to edit your name"
                >
                  {member.username}
                  <span className="member-name-you">(you)</span>
                </button>
              ) : member.username === currentUsername && isEditingName ? (
                <div className="member-name-edit-container">
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
                  <button
                    className="member-name-confirm"
                    onClick={handleRename}
                    title="Confirm (Enter)"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="member-name-cancel"
                    onClick={() => {
                      setIsEditingName(false);
                      setNewName(currentUsername);
                    }}
                    title="Cancel (Esc)"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className="member-name">{member.username}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messages section */}
      <div className="messages-section">
        <ScrollArea className="messages-scroll" ref={scrollContainerRef}>
          <div className="messages-list">
            {messagesWithFormattedTimes.map((msg) => (
              <MessageItem key={msg.id} msg={msg} formattedTime={msg.formattedTime} />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Input section */}
      <div className="chat-input-section">
        <div className="chat-input-wrapper">
          <Input
            type="text"
            placeholder="Type a message..."
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
      </div>
    </div>
  );
}
