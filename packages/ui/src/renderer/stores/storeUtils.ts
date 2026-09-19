/**
 * Selector-based store utility for React useSyncExternalStore.
 * Provides memoization and shallow equality checking to prevent infinite re-render loops
 * when selectors return derived object or array literals.
 */

import { useRef, useCallback, useSyncExternalStore } from 'react';

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

export function useStoreWithSelector<State, Selection>(
  subscribe: (listener: () => void) => () => void,
  getState: () => State,
  selector: (state: State) => Selection,
  isEqual: (a: Selection, b: Selection) => boolean = shallowEqual
): Selection {
  const cacheRef = useRef<{
    hasValue: boolean;
    state: State | undefined;
    selector: ((state: State) => Selection) | undefined;
    value: Selection | undefined;
  }>({
    hasValue: false,
    state: undefined,
    selector: undefined,
    value: undefined,
  });

  const getSnapshot = useCallback(() => {
    const currentState = getState();
    const cache = cacheRef.current;
    if (cache.hasValue && cache.state === currentState && cache.selector === selector) {
      return cache.value as Selection;
    }
    const nextValue = selector(currentState);
    if (cache.hasValue && isEqual(cache.value as Selection, nextValue)) {
      return cache.value as Selection;
    }
    cache.hasValue = true;
    cache.state = currentState;
    cache.selector = selector;
    cache.value = nextValue;
    return nextValue;
  }, [getState, selector, isEqual]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
