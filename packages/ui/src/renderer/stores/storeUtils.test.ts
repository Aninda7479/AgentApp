import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { shallowEqual, useStoreWithSelector } from './storeUtils';

describe('storeUtils: shallowEqual', () => {
  it('correctly compares primitives', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual('hello', 'hello')).toBe(true);
    expect(shallowEqual('hello', 'world')).toBe(false);
    expect(shallowEqual(true, true)).toBe(true);
    expect(shallowEqual(true, false)).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
    expect(shallowEqual(null, undefined)).toBe(false);
  });

  it('correctly compares shallow arrays', () => {
    expect(shallowEqual([], [])).toBe(true);
    expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallowEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(shallowEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('correctly compares shallow objects', () => {
    expect(shallowEqual({}, {})).toBe(true);
    expect(shallowEqual({ a: 1, b: 'two' }, { a: 1, b: 'two' })).toBe(true);
    expect(shallowEqual({ a: 1, b: 'two' }, { a: 1, b: 'three' })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('handles mixed types safely', () => {
    expect(shallowEqual([], {})).toBe(false);
    expect(shallowEqual({}, [])).toBe(false);
    expect(shallowEqual({ 0: 'a' }, ['a'])).toBe(false);
    expect(shallowEqual(null, {})).toBe(false);
    expect(shallowEqual({}, null)).toBe(false);
    expect(shallowEqual(123, {})).toBe(false);
  });
});

describe('storeUtils: useStoreWithSelector', () => {
  it('renders correctly with useStoreWithSelector in SSR/static mode', () => {
    const listeners = new Set<() => void>();
    const state = { count: 10, name: 'SuperAgent' };
    const subscribe = (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };
    const getState = () => state;

    const TestComponent: React.FC = () => {
      const selected = useStoreWithSelector(subscribe, getState, (s) => ({
        c: s.count,
        n: s.name,
      }));
      return React.createElement('span', null, `${selected.n}: ${selected.c}`);
    };

    const html = renderToStaticMarkup(React.createElement(TestComponent));
    expect(html).toBe('<span>SuperAgent: 10</span>');
  });
});
