import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ImageGalleryModal,
  AudioPlayer,
  VideoPlayer,
  PPTSlidePresenter,
  ImageItem,
} from '../src/index.js';

/**
 * Regression tests for the media-player loading / error states added so a
 * broken generated-media URL surfaces a clear message instead of a silent
 * black box or broken image (mission point 4 — finish; point 3 — media surface).
 *
 * Note: `renderToString` only exercises the initial (server) render, so the
 * error panels — which appear only after a client-side `onError` event — are
 * asserted as *absent* here. The error transition itself is verified by type
 * checking + build; its visual behaviour is a prediction (browser not drivable
 * in this environment).
 */
describe('Media player loading & error states', () => {
  describe('VideoPlayer (Step 089)', () => {
    it('shows a loading indicator before the video is ready', () => {
      const html = renderToString(
        React.createElement(VideoPlayer, {
          src: 'https://example.com/demo.mp4',
          title: 'Autonomous Execution Demo',
        })
      );
      expect(html).toContain('data-testid="video-loading"');
      expect(html).toContain('Loading video');
    });

    it('does not show the error panel before any load failure', () => {
      const html = renderToString(
        React.createElement(VideoPlayer, {
          src: 'https://example.com/demo.mp4',
          title: 'Autonomous Execution Demo',
        })
      );
      expect(html).not.toContain('data-testid="video-error"');
    });
  });

  describe('AudioPlayer (Step 088)', () => {
    it('shows a buffering indicator before the track is ready', () => {
      const html = renderToString(
        React.createElement(AudioPlayer, {
          src: 'https://example.com/audio.mp3',
          title: 'Podcast Episode 1',
          artist: 'Agent Voice Studio',
        })
      );
      expect(html).toContain('data-testid="audio-loading"');
      expect(html).toContain('Buffering audio');
    });

    it('does not show the error banner before any load failure', () => {
      const html = renderToString(
        React.createElement(AudioPlayer, {
          src: 'https://example.com/audio.mp3',
          title: 'Podcast Episode 1',
        })
      );
      expect(html).not.toContain('data-testid="audio-error"');
    });
  });

  describe('ImageGalleryModal (Step 087)', () => {
    const mockImages: ImageItem[] = [
      { id: 'img-1', url: 'https://example.com/img1.jpg', title: 'Landscape AI Render' },
      { id: 'img-2', url: 'https://example.com/img2.jpg', title: 'Portrait AI Render' },
    ];

    it('renders the open gallery with its counter and no error overlay initially', () => {
      const html = renderToString(
        React.createElement(ImageGalleryModal, {
          images: mockImages,
          initialIndex: 0,
          isOpen: true,
          onClose: () => {},
        })
      );
      // React splits `{currentIndex + 1} / {images.length}` with comment markers in SSR.
      expect(html).toContain('Landscape AI Render');
      expect(html).toContain('<!-- --> / <!-- -->');
      expect(html).not.toContain('data-testid="image-error"');
    });
  });

  describe('PPTSlidePresenter (Step 091)', () => {
    const slides = [
      { id: 's1', title: 'Intro', imageUrl: 'https://example.com/slide1.png' },
      { id: 's2', title: 'Details', imageUrl: 'https://example.com/slide2.png' },
    ];

    it('renders the slide deck with its counter and no error overlay initially', () => {
      const html = renderToString(
        React.createElement(PPTSlidePresenter, { slides, initialSlide: 0 })
      );
      // React splits `Slide {n} of {m}` with comment markers in SSR.
      expect(html).toContain('Slide <!-- -->1<!-- --> of <!-- -->2');
      expect(html).not.toContain('data-testid="ppt-image-error"');
    });
  });
});
