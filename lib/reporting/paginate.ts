/** Offset/limit paging over an already-aggregated, deterministically ordered list. */
export function paginate<T>(items: T[], limit: number, offset: number) {
  const page = items.slice(offset, offset + limit);
  return {
    page,
    pagination: {
      limit,
      offset,
      total: items.length,
      truncated: offset + page.length < items.length,
    },
  };
}
