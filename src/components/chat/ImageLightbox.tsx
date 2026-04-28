import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

export function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc closes; lock body scroll while open. The component only mounts
  // when an image is selected, so cleanup runs on close.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeydown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="chat-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        ref={closeBtnRef}
        type="button"
        className="chat-image-lightbox-close"
        onClick={onClose}
        aria-label="Close image preview"
        title="Close (Esc)"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt="Full-size preview"
        className="chat-image-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
