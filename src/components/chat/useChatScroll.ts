import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

interface UseChatScrollParams {
  messagesLength: number;
  // Set to `true` by the consumer just before sending; this hook resets it
  // to `false` after auto-scrolling so single-message sends always pin to
  // bottom regardless of the user's prior scroll position.
  justSentRef: React.MutableRefObject<boolean>;
}

interface UseChatScrollResult {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  bottomSentinelRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
  handleScroll: () => void;
}

/**
 * Auto-scroll behavior for the chat list.
 *
 * Pins the scroll position to the bottom when:
 *   - the user is already near the bottom (200 px threshold), OR
 *   - the user just sent a message themselves (justSentRef).
 *
 * Uses three signals:
 *   1. A passive `onScroll` near-bottom check (fast, but stale when content
 *      grows without user interaction).
 *   2. An IntersectionObserver on a bottom sentinel — authoritative.
 *   3. A ResizeObserver on the scroll content — catches font-swap layout
 *      shifts that would otherwise leave the user stranded.
 *   4. `document.fonts.ready` — belt-and-suspenders for the font race.
 */
export function useChatScroll({
  messagesLength,
  justSentRef,
}: UseChatScrollParams): UseChatScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Fallback near-bottom check; threshold matches the IO rootMargin.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
  }, []);

  useLayoutEffect(() => {
    const currentCount = messagesLength;
    const prevCount = prevMessageCountRef.current;

    if (currentCount > prevCount && currentCount > 0) {
      if (justSentRef.current || isNearBottomRef.current) {
        scrollToBottom();
        justSentRef.current = false;
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messagesLength, scrollToBottom, justSentRef]);

  // Authoritative bottom signal — survives content growth without
  // user-initiated scroll events.
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

  // Re-pin on layout shifts (e.g. webfont swap).
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

  // Final re-pin once webfonts are fully ready.
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

  return { scrollContainerRef, bottomSentinelRef, scrollToBottom, handleScroll };
}
