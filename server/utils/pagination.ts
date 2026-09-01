export const getPagination = (
    query: Record<string, unknown>,
    options: { defaultPageSize?: number; maxPageSize?: number } = {}
) => {
    const defaultPageSize = options.defaultPageSize ?? 25;
    const maxPageSize = options.maxPageSize ?? 100;
    const page = Math.max(1, Number(query.page || 1) || 1);
    const pageSize = Math.min(maxPageSize, Math.max(1, Number(query.pageSize || query.limit || defaultPageSize) || defaultPageSize));
    const offset = (page - 1) * pageSize;

    return { page, pageSize, offset };
};

export const getPaginationMeta = (page: number, pageSize: number, total: number) => ({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
});
