import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';
import { Settings } from '@sidepanel/components/Settings/Settings';
import {
  HOLD_ACCELERATION_DELAY_MS,
  HOLD_FAST_INTERVAL_MS,
  HOLD_INITIAL_DELAY_MS,
  HOLD_SLOW_INTERVAL_MS,
} from '@sidepanel/components/Settings/HoldRepeatButton';
import { useSettingsStore } from '@sidepanel/store/settingsStore';

function preparePointerCapture(button: HTMLElement): void {
  Object.defineProperty(button, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
}

function holdStart(button: HTMLElement): void {
  preparePointerCapture(button);
  fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
}

beforeEach(() => {
  vi.mocked(chrome.storage.local.set).mockReset().mockResolvedValue(undefined);
  useSettingsStore.setState({
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS },
    isLoaded: true,
    isPersisting: false,
    error: null,
  });
});

afterEach(async () => {
  await act(async () => {
    await useSettingsStore.getState().flushDelayPersistence();
  });
  vi.useRealTimers();
});

describe('Settings', () => {
  it('repeats held timer changes with accelerated cadence and one final save', async () => {
    vi.useFakeTimers();
    render(<Settings />);
    const retryInput = screen.getByLabelText('Max retries');
    const increaseMaximum = screen.getByRole('button', {
      name: 'Increase maximum delay by 5 seconds',
    });

    holdStart(increaseMaximum);
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(65);

    act(() => vi.advanceTimersByTime(HOLD_INITIAL_DELAY_MS - 1));
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(65);

    act(() => vi.advanceTimersByTime(1));
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(70);

    act(() => vi.advanceTimersByTime(HOLD_SLOW_INTERVAL_MS));
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(75);

    act(() => vi.advanceTimersByTime(HOLD_ACCELERATION_DELAY_MS - HOLD_SLOW_INTERVAL_MS));
    const beforeFastRepeat = useSettingsStore.getState().settings.delayMaxSeconds;
    act(() => vi.advanceTimersByTime(HOLD_FAST_INTERVAL_MS));
    expect(useSettingsStore.getState().settings.delayMaxSeconds).toBe(beforeFastRepeat + 5);
    expect(screen.getByLabelText('Max retries')).toBe(retryInput);

    fireEvent.pointerUp(increaseMaximum, { pointerId: 1 });
    await act(async () => {});
    act(() => vi.advanceTimersByTime(500));

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a pointer action when its click event follows', async () => {
    vi.useFakeTimers();
    render(<Settings />);
    const decreaseMinimum = screen.getByRole('button', {
      name: 'Decrease minimum delay by 5 seconds',
    });

    holdStart(decreaseMinimum);
    fireEvent.pointerUp(decreaseMinimum, { pointerId: 1 });
    fireEvent.click(decreaseMinimum, { detail: 1 });
    await act(async () => {});

    expect(useSettingsStore.getState().settings.delayMinSeconds).toBe(25);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard activation as one accessible step', () => {
    render(<Settings />);
    const decreaseMinimum = screen.getByRole('button', {
      name: 'Decrease minimum delay by 5 seconds',
    });

    act(() => fireEvent.click(decreaseMinimum, { detail: 0 }));

    expect(useSettingsStore.getState().settings.delayMinSeconds).toBe(25);
  });

  it.each([
    ['pointer cancellation', (button: HTMLElement) => fireEvent.pointerCancel(button, { pointerId: 1 })],
    ['lost pointer capture', (button: HTMLElement) => fireEvent.lostPointerCapture(button, { pointerId: 1 })],
  ])('flushes once on %s', async (_name, endHold) => {
    vi.useFakeTimers();
    render(<Settings />);
    const increaseMaximum = screen.getByRole('button', {
      name: 'Increase maximum delay by 5 seconds',
    });

    holdStart(increaseMaximum);
    endHold(increaseMaximum);
    await act(async () => {});
    act(() => vi.advanceTimersByTime(500));

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('stops and flushes when a held control reaches its policy bound', async () => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      settings: { delayMinSeconds: 5, delayMaxSeconds: 60, maxRetries: 2 },
      isLoaded: true,
    });
    render(<Settings />);
    const decreaseMinimum = screen.getByRole('button', {
      name: 'Decrease minimum delay by 5 seconds',
    });

    holdStart(decreaseMinimum);
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2_000));

    expect(useSettingsStore.getState().settings.delayMinSeconds).toBe(0);
    expect(decreaseMinimum).toBeDisabled();
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('flushes a held change when settings unmount', async () => {
    vi.useFakeTimers();
    const view = render(<Settings />);
    const increaseMaximum = screen.getByRole('button', {
      name: 'Increase maximum delay by 5 seconds',
    });

    holdStart(increaseMaximum);
    view.unmount();
    await act(async () => {});

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('disables controls at policy and range boundaries', () => {
    useSettingsStore.setState({
      settings: { delayMinSeconds: 60, delayMaxSeconds: 60, maxRetries: 2 },
      isLoaded: true,
    });
    render(<Settings />);

    expect(screen.getByRole('button', { name: 'Increase minimum delay by 5 seconds' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease maximum delay by 5 seconds' })).toBeDisabled();
  });

  it('disables all delay changes while saved settings load', () => {
    useSettingsStore.setState({ isLoaded: false });
    render(<Settings />);

    expect(screen.getByRole('button', { name: 'Decrease minimum delay by 5 seconds' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase maximum delay by 5 seconds' })).toBeDisabled();
    expect(screen.getByText('Loading saved settings…')).toBeInTheDocument();
  });

  it('shows saving status as a floating indicator without changing settings content', () => {
    useSettingsStore.setState({ isPersisting: true });
    render(<Settings />);

    expect(screen.getByText('Saving changes').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByText('Saving changes…')).not.toBeInTheDocument();
  });
});
