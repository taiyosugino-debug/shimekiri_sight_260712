import { SourceType } from '@/lib/types';

/** type ごとの configJson プレースホルダ例（PROJECT_SPEC.md §11参照） */
export const SOURCE_CONFIG_PLACEHOLDERS: Record<SourceType, string> = {
  rss: JSON.stringify(
    { deadlineFrom: 'title', defaults: { type: 'インターン', gradYear: 2028 } },
    null,
    2,
  ),
  json: JSON.stringify(
    {
      itemsPath: 'items',
      fields: { companyName: 'company', title: 'title', deadline: 'deadline', url: 'url' },
    },
    null,
    2,
  ),
  scrape: JSON.stringify(
    {
      itemSelector: '.job',
      fields: { title: '.title', deadline: '.deadline', url: 'a@href' },
    },
    null,
    2,
  ),
};
