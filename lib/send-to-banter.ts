import { fetchGroupConversationId, getOrCreateDm, sendMessage } from '@/lib/banter';
import type { Post } from '@/lib/posts';

// Caption-only text — the media itself travels in messages.image_url so the
// chat bubble can render a real thumbnail instead of a raw storage URL
// dumped into the visible text.
function postAsMessage(post: Post): string {
  return post.caption ? `📸 Shared a post: "${post.caption}"` : '📸 Shared a post';
}

/**
 * "Swipe up to banter" on a Feed card: opens (or creates) the DM thread with
 * the post's author, drops the post in with its caption as the message text
 * and the media URL in messages.image_url (rendered as a real thumbnail by
 * the chat screen, not a raw link), and returns the conversation id so the
 * caller can navigate to it.
 *
 * Throws rather than failing soft: getOrCreateDm's errors are the honest,
 * user-showable reasons this can fail ("You can only message people you
 * share a connection or group with.", blocked, etc.), and the swipe-up UI
 * wants to surface them verbatim.
 */
export async function sendPostToPosterDm(post: Post, senderId: string): Promise<string> {
  const conversationId = await getOrCreateDm(post.authorId);
  await sendMessage(conversationId, senderId, postAsMessage(post), post.mediaUrl);
  return conversationId;
}

/**
 * Forwards a Feed post into its group's Banter thread. Reuses Banter's own
 * fetchGroupConversationId()/sendMessage() untouched — this file only calls
 * them, it doesn't add anything to lib/banter.ts or touch Banter's schema.
 *
 * The post's caption becomes the message text and its media URL rides in
 * messages.image_url, so the group thread shows a real thumbnail instead of
 * a raw storage link.
 *
 * Groups are optional on posts now, so a group-less post has nowhere to
 * forward to — fails soft (returns false, doesn't throw) so the caller can
 * be honest with the user about whether the message actually landed
 * somewhere, rather than the app pretending it was delivered.
 */
export async function sendPostToBanter(post: Post, senderId: string): Promise<boolean> {
  if (!post.groupId) return false;
  try {
    const conversationId = await fetchGroupConversationId(post.groupId);
    if (!conversationId) {
      console.warn(`[send-to-banter] no Banter thread found for group "${post.groupId}".`);
      return false;
    }

    await sendMessage(conversationId, senderId, postAsMessage(post), post.mediaUrl);
    return true;
  } catch (e) {
    console.warn('[send-to-banter] could not send post to Banter:', e);
    return false;
  }
}
