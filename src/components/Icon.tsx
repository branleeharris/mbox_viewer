// Material Symbols (Apache-2.0), bundled locally so the app works offline.
import type { FC, SVGProps } from 'react';
import I_menu from '@material-symbols/svg-400/outlined/menu.svg?react';
import I_search from '@material-symbols/svg-400/outlined/search.svg?react';
import I_tune from '@material-symbols/svg-400/outlined/tune.svg?react';
import I_close from '@material-symbols/svg-400/outlined/close.svg?react';
import I_inbox from '@material-symbols/svg-400/outlined/inbox.svg?react';
import I_star from '@material-symbols/svg-400/outlined/star.svg?react';
import I_star_fill from '@material-symbols/svg-400/outlined/star-fill.svg?react';
import I_label_important from '@material-symbols/svg-400/outlined/label_important.svg?react';
import I_label_important_fill from '@material-symbols/svg-400/outlined/label_important-fill.svg?react';
import I_send from '@material-symbols/svg-400/outlined/send.svg?react';
import I_draft from '@material-symbols/svg-400/outlined/draft.svg?react';
import I_stacks from '@material-symbols/svg-400/outlined/stacks.svg?react';
import I_report from '@material-symbols/svg-400/outlined/report.svg?react';
import I_delete from '@material-symbols/svg-400/outlined/delete.svg?react';
import I_label from '@material-symbols/svg-400/outlined/label.svg?react';
import I_label_fill from '@material-symbols/svg-400/outlined/label-fill.svg?react';
import I_keyboard_arrow_down from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react';
import I_keyboard_arrow_up from '@material-symbols/svg-400/outlined/keyboard_arrow_up.svg?react';
import I_keyboard_arrow_right from '@material-symbols/svg-400/outlined/keyboard_arrow_right.svg?react';
import I_chevron_left from '@material-symbols/svg-400/outlined/chevron_left.svg?react';
import I_chevron_right from '@material-symbols/svg-400/outlined/chevron_right.svg?react';
import I_arrow_back from '@material-symbols/svg-400/outlined/arrow_back.svg?react';
import I_mark_email_unread from '@material-symbols/svg-400/outlined/mark_email_unread.svg?react';
import I_mark_email_read from '@material-symbols/svg-400/outlined/mark_email_read.svg?react';
import I_print from '@material-symbols/svg-400/outlined/print.svg?react';
import I_download from '@material-symbols/svg-400/outlined/download.svg?react';
import I_more_vert from '@material-symbols/svg-400/outlined/more_vert.svg?react';
import I_settings from '@material-symbols/svg-400/outlined/settings.svg?react';
import I_help from '@material-symbols/svg-400/outlined/help.svg?react';
import I_attach_file from '@material-symbols/svg-400/outlined/attach_file.svg?react';
import I_picture_as_pdf from '@material-symbols/svg-400/outlined/picture_as_pdf.svg?react';
import I_image from '@material-symbols/svg-400/outlined/image.svg?react';
import I_description from '@material-symbols/svg-400/outlined/description.svg?react';
import I_folder_zip from '@material-symbols/svg-400/outlined/folder_zip.svg?react';
import I_upload_file from '@material-symbols/svg-400/outlined/upload_file.svg?react';
import I_check_box from '@material-symbols/svg-400/outlined/check_box.svg?react';
import I_check_box_outline_blank from '@material-symbols/svg-400/outlined/check_box_outline_blank.svg?react';
import I_indeterminate_check_box from '@material-symbols/svg-400/outlined/indeterminate_check_box.svg?react';
import I_arrow_drop_down from '@material-symbols/svg-400/outlined/arrow_drop_down.svg?react';
import I_open_in_new from '@material-symbols/svg-400/outlined/open_in_new.svg?react';
import I_code from '@material-symbols/svg-400/outlined/code.svg?react';
import I_unfold_more from '@material-symbols/svg-400/outlined/unfold_more.svg?react';
import I_unfold_less from '@material-symbols/svg-400/outlined/unfold_less.svg?react';
import I_group from '@material-symbols/svg-400/outlined/group.svg?react';
import I_info from '@material-symbols/svg-400/outlined/info.svg?react';
import I_forum from '@material-symbols/svg-400/outlined/forum.svg?react';
import I_sell from '@material-symbols/svg-400/outlined/sell.svg?react';
import I_database from '@material-symbols/svg-400/outlined/database.svg?react';
import I_hide_image from '@material-symbols/svg-400/outlined/hide_image.svg?react';
import I_content_copy from '@material-symbols/svg-400/outlined/content_copy.svg?react';
import I_chat_bubble from '@material-symbols/svg-400/outlined/chat_bubble.svg?react';
import I_person from '@material-symbols/svg-400/outlined/person.svg?react';
import I_mail from '@material-symbols/svg-400/outlined/mail.svg?react';
import I_refresh from '@material-symbols/svg-400/outlined/refresh.svg?react';
import I_archive from '@material-symbols/svg-400/outlined/archive.svg?react';
import I_category from '@material-symbols/svg-400/outlined/category.svg?react';
import I_article from '@material-symbols/svg-400/outlined/article.svg?react';
import I_error from '@material-symbols/svg-400/outlined/error.svg?react';
import I_warning from '@material-symbols/svg-400/outlined/warning.svg?react';
import I_check_circle from '@material-symbols/svg-400/outlined/check_circle.svg?react';
import I_schedule from '@material-symbols/svg-400/outlined/schedule.svg?react';
import I_visibility from '@material-symbols/svg-400/outlined/visibility.svg?react';
import I_calendar_month from '@material-symbols/svg-400/outlined/calendar_month.svg?react';
import I_dark_mode from '@material-symbols/svg-400/outlined/dark_mode.svg?react';
import I_light_mode from '@material-symbols/svg-400/outlined/light_mode.svg?react';
import I_desktop_windows from '@material-symbols/svg-400/outlined/desktop_windows.svg?react';
import I_keyboard from '@material-symbols/svg-400/outlined/keyboard.svg?react';
import I_delete_forever from '@material-symbols/svg-400/outlined/delete_forever.svg?react';
import I_more_horiz from '@material-symbols/svg-400/outlined/more_horiz.svg?react';
import I_lock from '@material-symbols/svg-400/outlined/lock.svg?react';
import I_add from '@material-symbols/svg-400/outlined/add.svg?react';
import I_drafts from '@material-symbols/svg-400/outlined/drafts.svg?react';

const ICONS = {
  'menu': I_menu,
  'search': I_search,
  'tune': I_tune,
  'close': I_close,
  'inbox': I_inbox,
  'star': I_star,
  'star-fill': I_star_fill,
  'label_important': I_label_important,
  'label_important-fill': I_label_important_fill,
  'send': I_send,
  'draft': I_draft,
  'stacks': I_stacks,
  'report': I_report,
  'delete': I_delete,
  'label': I_label,
  'label-fill': I_label_fill,
  'keyboard_arrow_down': I_keyboard_arrow_down,
  'keyboard_arrow_up': I_keyboard_arrow_up,
  'keyboard_arrow_right': I_keyboard_arrow_right,
  'chevron_left': I_chevron_left,
  'chevron_right': I_chevron_right,
  'arrow_back': I_arrow_back,
  'mark_email_unread': I_mark_email_unread,
  'mark_email_read': I_mark_email_read,
  'print': I_print,
  'download': I_download,
  'more_vert': I_more_vert,
  'settings': I_settings,
  'help': I_help,
  'attach_file': I_attach_file,
  'picture_as_pdf': I_picture_as_pdf,
  'image': I_image,
  'description': I_description,
  'folder_zip': I_folder_zip,
  'upload_file': I_upload_file,
  'check_box': I_check_box,
  'check_box_outline_blank': I_check_box_outline_blank,
  'indeterminate_check_box': I_indeterminate_check_box,
  'arrow_drop_down': I_arrow_drop_down,
  'open_in_new': I_open_in_new,
  'code': I_code,
  'unfold_more': I_unfold_more,
  'unfold_less': I_unfold_less,
  'group': I_group,
  'info': I_info,
  'forum': I_forum,
  'sell': I_sell,
  'database': I_database,
  'hide_image': I_hide_image,
  'content_copy': I_content_copy,
  'chat_bubble': I_chat_bubble,
  'person': I_person,
  'mail': I_mail,
  'refresh': I_refresh,
  'archive': I_archive,
  'category': I_category,
  'article': I_article,
  'error': I_error,
  'warning': I_warning,
  'check_circle': I_check_circle,
  'schedule': I_schedule,
  'visibility': I_visibility,
  'calendar_month': I_calendar_month,
  'dark_mode': I_dark_mode,
  'light_mode': I_light_mode,
  'desktop_windows': I_desktop_windows,
  'keyboard': I_keyboard,
  'delete_forever': I_delete_forever,
  'lock': I_lock,
  'more_horiz': I_more_horiz,
  'add': I_add,
  'drafts': I_drafts,
} satisfies Record<string, FC<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  filled?: boolean;
}

export function Icon({ name, size = 20, filled, className, ...rest }: Props) {
  const key = (filled && `${name}-fill` in ICONS ? `${name}-fill` : name) as IconName;
  const Svg = ICONS[key];
  return (
    <Svg
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={'shrink-0 ' + (className ?? '')}
      {...rest}
    />
  );
}
