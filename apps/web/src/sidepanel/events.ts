/**
 * Window events between side panel tabs. The chat's "Find pins like my board" asks the Pinterest
 * tab (always mounted while open) to rank its loaded pins against the room's palette.
 */
export const FIND_SIMILAR_EVENT = 'hj:find-similar';

export const requestFindSimilar = () => window.dispatchEvent(new Event(FIND_SIMILAR_EVENT));
