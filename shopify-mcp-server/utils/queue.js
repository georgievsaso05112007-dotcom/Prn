/**
 * queue.js
 * Simple async queue for social media posts.
 * Prevents hitting rate limits by processing one post at a time
 * with a configurable delay between posts.
 */

import PQueue from 'p-queue';

// Process 1 post at a time, wait 2 seconds between posts
const queue = new PQueue({ concurrency: 1, interval: 2000, intervalCap: 1 });

// Keep a log of what's been queued
const queueLog = [];

/**
 * Add a social media post to the processing queue.
 * @param {Function} fn - Async function that performs the post
 * @param {Object} meta - Metadata to track in the log
 * @returns {Promise} Resolves when the post is processed
 */
export async function addToQueue(fn, meta = {}) {
  const entry = {
    id: `q_${Date.now()}`,
    ...meta,
    status: 'queued',
    addedAt: new Date().toISOString(),
  };
  queueLog.push(entry);

  return queue.add(async () => {
    entry.status = 'processing';
    entry.startedAt = new Date().toISOString();
    try {
      const result = await fn();
      entry.status = 'done';
      entry.finishedAt = new Date().toISOString();
      return result;
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message;
      throw err;
    }
  });
}

/**
 * Get the current queue status and history.
 */
export function getQueueStatus() {
  return {
    pending: queue.size,
    running: queue.pending,
    log: queueLog.slice(-50), // last 50 entries
  };
}

/**
 * Clear the queue (does not cancel in-progress items).
 */
export function clearQueue() {
  queue.clear();
  return { message: 'Queue cleared (in-progress items will finish)' };
}
