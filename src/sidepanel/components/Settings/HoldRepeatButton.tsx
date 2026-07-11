import React, { useCallback, useEffect, useRef, useState } from 'react';

export const HOLD_INITIAL_DELAY_MS = 300;
export const HOLD_SLOW_INTERVAL_MS = 120;
export const HOLD_ACCELERATION_DELAY_MS = 800;
export const HOLD_FAST_INTERVAL_MS = 60;

interface HoldRepeatButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  activeClassName: string;
  onRepeat: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

export const HoldRepeatButton: React.FC<HoldRepeatButtonProps> = ({
  activeClassName,
  className = '',
  disabled = false,
  onRepeat,
  onHoldStart,
  onHoldEnd,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onContextMenu,
  ...buttonProps
}) => {
  const onRepeatRef = useRef(onRepeat);
  const onHoldStartRef = useRef(onHoldStart);
  const onHoldEndRef = useRef(onHoldEnd);
  const isHoldingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const suppressPointerClickRef = useRef(false);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accelerationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerClickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  useEffect(() => {
    onRepeatRef.current = onRepeat;
  }, [onRepeat]);

  useEffect(() => {
    onHoldStartRef.current = onHoldStart;
  }, [onHoldStart]);

  useEffect(() => {
    onHoldEndRef.current = onHoldEnd;
  }, [onHoldEnd]);

  const clearTimers = useCallback(() => {
    if (initialTimerRef.current) {
      clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (accelerationTimerRef.current) {
      clearTimeout(accelerationTimerRef.current);
      accelerationTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  const resetPointerClickSuppression = useCallback(() => {
    if (pointerClickResetTimerRef.current) clearTimeout(pointerClickResetTimerRef.current);
    pointerClickResetTimerRef.current = setTimeout(() => {
      suppressPointerClickRef.current = false;
      pointerClickResetTimerRef.current = null;
    }, 0);
  }, []);

  const repeat = useCallback(() => {
    onRepeatRef.current();
  }, []);

  const stopHolding = useCallback(
    (updateVisualState = true) => {
      const wasHolding = isHoldingRef.current;
      clearTimers();
      isHoldingRef.current = false;
      pointerIdRef.current = null;
      if (updateVisualState) setIsHolding(false);
      if (wasHolding) {
        onHoldEndRef.current();
        resetPointerClickSuppression();
      }
    },
    [clearTimers, resetPointerClickSuppression],
  );

  useEffect(() => {
    if (disabled) stopHolding();
  }, [disabled, stopHolding]);

  useEffect(
    () => () => {
      stopHolding(false);
      if (pointerClickResetTimerRef.current) clearTimeout(pointerClickResetTimerRef.current);
    },
    [stopHolding],
  );

  const startHolding = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || disabled || !event.isPrimary || event.button !== 0) return;

      isHoldingRef.current = true;
      pointerIdRef.current = event.pointerId;
      suppressPointerClickRef.current = true;
      if (pointerClickResetTimerRef.current) clearTimeout(pointerClickResetTimerRef.current);
      setIsHolding(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable in older browser contexts.
      }

      onHoldStartRef.current();
      repeat();
      initialTimerRef.current = setTimeout(() => {
        if (!isHoldingRef.current) return;

        repeat();
        repeatTimerRef.current = setInterval(repeat, HOLD_SLOW_INTERVAL_MS);
        accelerationTimerRef.current = setTimeout(() => {
          if (!isHoldingRef.current) return;
          if (repeatTimerRef.current) clearInterval(repeatTimerRef.current);
          repeatTimerRef.current = setInterval(repeat, HOLD_FAST_INTERVAL_MS);
        }, HOLD_ACCELERATION_DELAY_MS);
      }, HOLD_INITIAL_DELAY_MS);
    },
    [disabled, onPointerDown, repeat],
  );

  const endHolding = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerUp?.(event);
      if (
        pointerIdRef.current !== null &&
        event.pointerId > 0 &&
        event.pointerId !== pointerIdRef.current
      ) {
        return;
      }
      stopHolding();
    },
    [onPointerUp, stopHolding],
  );

  const cancelHolding = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerCancel?.(event);
      stopHolding();
    },
    [onPointerCancel, stopHolding],
  );

  const handleLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      onLostPointerCapture?.(event);
      stopHolding();
    },
    [onLostPointerCapture, stopHolding],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (suppressPointerClickRef.current) {
        suppressPointerClickRef.current = false;
        return;
      }
      if (!event.defaultPrevented && event.detail === 0 && !disabled) repeat();
    },
    [disabled, onClick, repeat],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onContextMenu?.(event);
      if (isHoldingRef.current) event.preventDefault();
    },
    [onContextMenu],
  );

  return (
    <button
      {...buttonProps}
      type="button"
      className={`${className} ${isHolding ? activeClassName : ''}`.trim()}
      disabled={disabled}
      data-holding={isHolding || undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={cancelHolding}
      onPointerDown={startHolding}
      onPointerUp={endHolding}
    />
  );
};
