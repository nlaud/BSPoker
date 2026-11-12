import React, { useEffect, useRef } from 'react';

export interface LogDrawerProps {
  isOpen: boolean;
  entries: string[];
  onClose: () => void;
}

export const LogDrawer: React.FC<LogDrawerProps> = ({
  isOpen,
  entries,
  onClose,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, entries]);

  if (!isOpen) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      className="log-drawer-backdrop"
      onClick={handleClick}
      role="dialog"
      aria-modal="true"
      aria-label="Log"
    >
      <div className="log-drawer-panel" onClick={handleClick}>
        <div className="log-drawer-header">
          <h2 className="log-drawer-title">Log</h2>
        </div>
        <div className="log-drawer-content" ref={scrollRef}>
          {entries.length === 0 ? (
            <div className="log-empty">No actions yet</div>
          ) : (
            entries.map((entry, idx) => (
              <div key={idx} className="log-entry">
                {entry}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
