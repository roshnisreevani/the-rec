// Moved to components/moderation/content-menu.tsx since Connections now
// reuses this same "..." action sheet (with its own report reasons) for
// another user's profile, not just Feed posts/comments. Re-exported from
// here so nothing importing the old path breaks; this session's tools can't
// delete files, so this stub replaces the old implementation in place.
// Update imports to '@/components/moderation/content-menu' when convenient.
export { ContentMenu } from '@/components/moderation/content-menu';
