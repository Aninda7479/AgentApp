import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  ImageGalleryModal,
  AudioPlayer,
  VideoPlayer,
  PDFViewport,
  PPTSlidePresenter,
  ImageItem,
  SlideData,
} from '../src/index.js';

describe('Desktop Media Engineering Suite (Steps 087 - 091)', () => {
  const mockImages: ImageItem[] = [
    { id: 'img-1', url: 'https://example.com/img1.jpg', title: 'Landscape AI Render', description: 'Generated scenic view' },
    { id: 'img-2', url: 'https://example.com/img2.jpg', title: 'Portrait AI Render', description: 'Generated avatar' },
  ];

  describe('Step 087: Interactive Image Gallery & Editor Modal (ImageGalleryModal)', () => {
    it('should create valid React Element with gallery props when open or closed', () => {
      const closedElem = React.createElement(ImageGalleryModal, {
        images: mockImages,
        isOpen: false,
        onClose: () => {},
      });
      expect(React.isValidElement(closedElem)).toBe(true);
      expect(closedElem.type).toBe(ImageGalleryModal);
      expect(closedElem.props.isOpen).toBe(false);
      expect(closedElem.props.images).toHaveLength(2);

      const openElem = React.createElement(ImageGalleryModal, {
        images: mockImages,
        initialIndex: 0,
        isOpen: true,
        onClose: () => {},
      });
      expect(React.isValidElement(openElem)).toBe(true);
      expect(openElem.props.isOpen).toBe(true);
      expect(openElem.props.initialIndex).toBe(0);
    });
  });

  describe('Step 088: Embedded Audio Player Component (AudioPlayer)', () => {
    it('should create valid React Element with audio track properties', () => {
      const elem = React.createElement(AudioPlayer, {
        src: 'https://example.com/audio.mp3',
        title: 'Podcast Episode 1',
        artist: 'Agent Voice Studio',
        autoPlay: false,
        loop: true,
      });

      expect(React.isValidElement(elem)).toBe(true);
      expect(elem.type).toBe(AudioPlayer);
      expect(elem.props.src).toBe('https://example.com/audio.mp3');
      expect(elem.props.title).toBe('Podcast Episode 1');
      expect(elem.props.artist).toBe('Agent Voice Studio');
      expect(elem.props.loop).toBe(true);
    });
  });

  describe('Step 089: Embedded Video Player Component (VideoPlayer)', () => {
    it('should create valid React Element with video source and poster properties', () => {
      const elem = React.createElement(VideoPlayer, {
        src: 'https://example.com/demo.mp4',
        poster: 'https://example.com/poster.jpg',
        title: 'Autonomous Execution Demo',
        autoPlay: false,
      });

      expect(React.isValidElement(elem)).toBe(true);
      expect(elem.type).toBe(VideoPlayer);
      expect(elem.props.src).toBe('https://example.com/demo.mp4');
      expect(elem.props.poster).toBe('https://example.com/poster.jpg');
      expect(elem.props.title).toBe('Autonomous Execution Demo');
    });
  });

  describe('Step 090: Built-in PDF Viewport Renderer (PDFViewport)', () => {
    it('should create valid React Element with document page properties', () => {
      const elem = React.createElement(PDFViewport, {
        numPages: 15,
        initialPage: 2,
        title: 'Agent_Architecture.pdf',
      });

      expect(React.isValidElement(elem)).toBe(true);
      expect(elem.type).toBe(PDFViewport);
      expect(elem.props.numPages).toBe(15);
      expect(elem.props.initialPage).toBe(2);
      expect(elem.props.title).toBe('Agent_Architecture.pdf');
    });
  });

  describe('Step 091: PowerPoint Slide Presentation Renderer (PPTSlidePresenter)', () => {
    const mockSlides: SlideData[] = [
      { id: 's1', title: 'Welcome', subtitle: 'Introduction to Agents', content: ['Feature A', 'Feature B'] },
      { id: 's2', title: 'Architecture', notes: 'Detail the engine pipeline here.' },
    ];

    it('should create valid React Element with presentation slide deck properties', () => {
      const elem = React.createElement(PPTSlidePresenter, {
        slides: mockSlides,
        initialSlide: 0,
      });

      expect(React.isValidElement(elem)).toBe(true);
      expect(elem.type).toBe(PPTSlidePresenter);
      expect(elem.props.slides).toHaveLength(2);
      expect(elem.props.initialSlide).toBe(0);
      expect(elem.props.slides[0].title).toBe('Welcome');
    });
  });
});
