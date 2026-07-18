// @vitest-environment jsdom
/**
 * Runtime regression tests for the media-player ERROR states.
 *
 * The SSR test (desktop_media_states.test.ts) can only assert the initial
 * loading render — the error panels appear only after a client-side `onError`
 * event, which `renderToString` cannot fire. This file drives a real DOM
 * (jsdom) so we actually dispatch the `error` event on the <video>/<audio>/<img>
 * element and confirm the matching error UI renders and the loading UI clears.
 *
 * Serves mission point 4 (GUI finish): a broken generated-media URL must show a
 * clear, actionable message instead of a silent black box. Without this test the
 * error transition was only "verified by build" (a prediction, not a fact).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { VideoPlayer, AudioPlayer, ImageGalleryModal, type ImageItem } from '../src/index.js';

// Tell React we're in a test environment so `act` is allowed.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

describe('Media player error states (runtime)', () => {
  it('VideoPlayer swaps the loading overlay for an error panel after onError', () => {
    render(React.createElement(VideoPlayer, { src: 'https://example.com/broken.mp4', title: 'Demo' }));

    const video = container.querySelector('video');
    expect(video).toBeTruthy();

    act(() => {
      video!.dispatchEvent(new Event('error', { bubbles: false }));
    });

    expect(container.querySelector('[data-testid="video-error"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="video-loading"]')).toBeNull();
  });

  it('AudioPlayer shows the error banner after onError', () => {
    render(React.createElement(AudioPlayer, { src: 'https://example.com/broken.mp3', title: 'Podcast' }));

    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();

    act(() => {
      audio!.dispatchEvent(new Event('error', { bubbles: false }));
    });

    expect(container.querySelector('[data-testid="audio-error"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="audio-loading"]')).toBeNull();
  });

  it('ImageGalleryModal shows the error overlay after the image onError', () => {
    const images: ImageItem[] = [
      { id: 'img-1', url: 'https://example.com/broken.jpg', title: 'Render' },
    ];
    render(
      React.createElement(ImageGalleryModal, {
        images,
        initialIndex: 0,
        isOpen: true,
        onClose: () => {},
      })
    );

    const img = container.querySelector('img');
    expect(img).toBeTruthy();

    act(() => {
      img!.dispatchEvent(new Event('error', { bubbles: false }));
    });

    expect(container.querySelector('[data-testid="image-error"]')).toBeTruthy();
  });
});
