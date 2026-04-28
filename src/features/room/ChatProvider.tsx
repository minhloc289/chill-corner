import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { Message, Reaction, ReactionsByMessage } from './hooks/useRoomRealtime';
import type { RoomMember } from './hooks/useRoomPresence';

// --- Two-context split ---
// State and dispatch are split so consumers that ONLY need stable
// callbacks (e.g. <ChatToggleButton onToggle> and the buzz keyboard
// shortcut) don't re-render when messages or unread counts change.
//
// React docs: https://react.dev/reference/react/useContext (the standard
// "split the context" recipe for avoiding tearing across many consumers).

export interface ChatState {
  messages: Message[];
  unreadCount: number;
  reactionsByMessage: ReactionsByMessage;
  members: RoomMember[];
}

export interface ChatDispatch {
  resetUnreadCount: () => void;
  sendMessage: (message: string, replyTo: Message | null) => void | Promise<void>;
  react: (messageId: string, emoji: string) => void | Promise<void>;
  unreact: (messageId: string, emoji: string) => void | Promise<void>;
  buzz: () => void | Promise<void>;
  rename: (newName: string) => void | Promise<void>;
}

const ChatStateContext = createContext<ChatState | null>(null);
const ChatDispatchContext = createContext<ChatDispatch | null>(null);

interface ChatProviderProps {
  state: ChatState;
  dispatch: ChatDispatch;
  children: ReactNode;
}

/**
 * Provider for the chat-related subtree. Owns no realtime channel
 * itself — `useRoomRealtime` is called once in the page component (one
 * layer above) and its results flow down here. This avoids the trap of
 * accidentally subscribing twice from two consumers.
 */
export function ChatProvider({ state, dispatch, children }: ChatProviderProps) {
  // The state object identity already changes only when its members do
  // (memoized via useMemo at the call site), but we wrap it again here
  // to make the contract explicit at the provider boundary.
  const stateValue = useMemo<ChatState>(
    () => state,
    // The page passes a fresh object each render that's structurally
    // memoized via stable members → this comparison is cheap.
    [state.messages, state.unreadCount, state.reactionsByMessage, state.members],
  );

  return (
    <ChatStateContext.Provider value={stateValue}>
      <ChatDispatchContext.Provider value={dispatch}>
        {children}
      </ChatDispatchContext.Provider>
    </ChatStateContext.Provider>
  );
}

export function useChatState(): ChatState {
  const ctx = useContext(ChatStateContext);
  if (!ctx) throw new Error('useChatState must be used inside <ChatProvider>');
  return ctx;
}

export function useChatDispatch(): ChatDispatch {
  const ctx = useContext(ChatDispatchContext);
  if (!ctx) throw new Error('useChatDispatch must be used inside <ChatProvider>');
  return ctx;
}

// Re-export types so consumers can import everything from this module.
export type { Message, Reaction, ReactionsByMessage, RoomMember };
