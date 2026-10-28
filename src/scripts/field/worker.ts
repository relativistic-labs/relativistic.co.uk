/// <reference lib="webworker" />
// Runs the field on an OffscreenCanvas, off the page's main thread.
import { createField, type ToField } from './core';

let handle: ((m: ToField) => void) | null = null;
const queue: ToField[] = [];

self.onmessage = (e: MessageEvent<{ canvas: OffscreenCanvas } | ToField>) => {
  const data = e.data;
  if ('canvas' in data) {
    handle = createField(data.canvas, (m) => self.postMessage(m));
    if (!handle) self.postMessage({ type: 'failed' });
    for (const m of queue.splice(0)) handle?.(m);
  } else if (handle) handle(data);
  else queue.push(data);
};
