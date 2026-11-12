import React, { useState, useEffect, useRef } from 'react';
import { Hand, compareHands, normalForm, Rules } from '../engine/hands';
import { parseHand } from '../engine/parser';

export interface HandDialogProps {
  isOpen: boolean;
  currentCall: { hand: Hand; byPlayerId: string } | null;
  onCallHand: (hand: Hand) => void;
  onClose: () => void;
  rules?: Rules;
}

export const HandDialog: React.FC<HandDialogProps> = ({
  isOpen,
  currentCall,
  onCallHand,
  onClose,
  rules,
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentNormal = currentCall ? normalForm(currentCall.hand) : null;
  const headerText = currentNormal ? `Must beat ${currentNormal}` : 'Any hand to start';

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setError(null);
      setConfirmPrompt(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const parseResult = parseHand(input);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!parseResult.ok) {
      setError(parseResult.error);
      return;
    }

    const normalizedInput = input.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedTarget = parseResult.normal.toLowerCase().replace(/\s+/g, ' ');
    const isAlreadyNormal = normalizedInput === normalizedTarget;

    if (!isAlreadyNormal) {
      // Replace input text with normal form and prompt confirmation
      setInput(parseResult.normal);
      setConfirmPrompt('Press Enter again to call it');
      return;
    }

    // Already in normal form, check if beats current call
    if (currentCall) {
      if (compareHands(parseResult.hand, currentCall.hand, rules) <= 0) {
        setError(`Must beat ${currentNormal}`);
        setConfirmPrompt(null);
        return;
      }
    }

    // Valid and higher
    onCallHand(parseResult.hand);
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    setError(null);
    setConfirmPrompt(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container hand-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Call a hand"
      >
        <div className="dialog-header">
          <h2 className="dialog-title">{headerText}</h2>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          <input
            ref={inputRef}
            type="text"
            className="hand-input"
            value={input}
            onChange={handleChange}
            placeholder="e.g. Pair of Nines, 3 9s 2 As, Flush of Hearts"
            autoComplete="off"
            spellCheck="false"
          />

          <div className="preview-line">
            {confirmPrompt ? (
              <span className="confirm-prompt">{confirmPrompt}</span>
            ) : error ? (
              <span className="error-text">
                {/* Specific hints (e.g. "Name a suit") help; the generic "Try: ..." list does not. */}
                {!parseResult.ok && parseResult.hint && !parseResult.hint.startsWith('Try:')
                  ? `${error} - ${parseResult.hint}`
                  : error}
              </span>
            ) : parseResult.ok ? (
              <span className="preview-normal">{parseResult.normal}</span>
            ) : null}
          </div>

          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Call
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
