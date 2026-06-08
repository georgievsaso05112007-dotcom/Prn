/**
 * scheduler.js
 * Cron-based scheduler for social media posts.
 * Posts are stored in memory (or you can swap for a database).
 *
 * Usage: schedule a post → it fires at the specified time automatically.
 */

import cron from 'node-cron';

// In-memory store of scheduled posts
// Each entry: { id, platform, content, scheduledTime, cronExpression, task }
const scheduledPosts = new Map();
let postCounter = 1;

/**
 * Schedule a social media post.
 * @param {Object} options
 * @param {string} options.platform   - 'instagram' | 'facebook' | 'tiktok' | 'pinterest'
 * @param {string} options.content    - Caption / post text
 * @param {string} options.imageUrl   - URL of image to post
 * @param {Date|string} options.scheduledTime - When to post (Date object or ISO string)
 * @param {Function} options.postFn   - Async function to call when it's time to post
 * @returns {{ id: string, status: string }}
 */
export function schedulePost({ platform, content, imageUrl, scheduledTime, postFn }) {
  const date = new Date(scheduledTime);

  // Build a cron expression from the date
  // Format: "minute hour day month *"
  const cronExpr = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

  const id = `post_${postCounter++}`;

  const task = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Firing scheduled post ${id} for ${platform}`);
    try {
      await postFn({ platform, content, imageUrl });
      console.log(`[Scheduler] Post ${id} sent successfully`);
    } catch (err) {
      console.error(`[Scheduler] Post ${id} failed:`, err.message);
    }
    // Stop the cron task after it fires once
    task.stop();
    scheduledPosts.delete(id);
  });

  scheduledPosts.set(id, { id, platform, content, imageUrl, scheduledTime: date.toISOString(), cronExpr, task });

  return { id, status: 'scheduled', scheduledTime: date.toISOString() };
}

/**
 * Get all currently scheduled posts.
 * @returns {Array} List of scheduled post objects
 */
export function getScheduledPosts() {
  return Array.from(scheduledPosts.values()).map(({ id, platform, content, scheduledTime }) => ({
    id, platform, content: content.substring(0, 80) + '...', scheduledTime,
  }));
}

/**
 * Cancel a scheduled post by ID.
 * @param {string} id
 */
export function cancelScheduledPost(id) {
  const post = scheduledPosts.get(id);
  if (!post) return { success: false, message: `Post ${id} not found` };
  if (post.task) post.task.stop();
  scheduledPosts.delete(id);
  return { success: true, message: `Post ${id} cancelled` };
}
