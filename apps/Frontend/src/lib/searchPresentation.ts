/** Placeholder data belongs to the previous search and must not stay clickable. */
export function searchPresentation(query: {
  data?: { results: unknown[] };
  isError: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
}) {
  const loading = (!query.data && !query.isError) || query.isPlaceholderData || (query.isError && query.isFetching);
  return {
    loading,
    failed: query.isError && !loading,
    skeletonCount: query.data?.results.length || 6,
  };
}
