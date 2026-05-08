export function matcheaEntregaQuery(
  row: { githubUsernames: string[]; repoName?: string | null },
  rawQuery: string
): boolean {
  const query = rawQuery.toLowerCase().trim();
  if (!query) return true;
  return (
    row.githubUsernames.some((username) => username.toLowerCase().includes(query)) ||
    (row.repoName ?? "").toLowerCase().includes(query)
  );
}
