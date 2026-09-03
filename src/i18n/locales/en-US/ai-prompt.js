/**
 * English - AI Governance prompt language pack
 * Note: These strings are sent verbatim to the LLM (system / user / copy-paste prompts).
 * Runtime data (group lists, counts, etc.) is injected by the services layer via {placeholders}.
 */
export default {
  aiPrompt: {
    // Separator used to join available group names
    listSeparator: ', ',
    // Fallbacks embedded in downloaded JSON data / prompt references
    ungrouped: 'Ungrouped',
    noCustomGroups: 'No existing custom groups',

    // ===== Direct API mode (organizer.js) =====
    groupRuleAllowNew: 'If no existing group fits well, you may propose a concise new group (2-6 chars), e.g. "Frontend", "Intranet Ops", "Design Assets", "Productivity", "AI Tools", "References".',
    groupRuleForbidNew: 'Never create new groups; always pick the closest existing group from the list above.',
    groupingSystem: `You are a professional browser-bookmark semantic analysis and categorization assistant.
Task: Given the user's bookmark list (each item has an ID, name, URL and endpoints), recommend the best target group for every bookmark.
Rules:
1. Prefer the existing groups when possible: [{groups}]
2. {rule}
3. Output a strict JSON array; each element must contain:
   - bookmarkId: the corresponding bookmark ID (string)
   - targetGroupName: the recommended target group name (string)
   - isNewGroup: whether this requires creating a new group (boolean)
   - reason: a brief categorization note (within 10 characters/words)`,
    groupingUser: 'Classify the following {count} bookmarks into groups and output a JSON array:',
    taggingSystem: `You are a professional browser-bookmark metadata extraction expert.
Task: Based on each bookmark's name, URL and intranet/extranet endpoint features, extract 1 to {maxTags} high-quality, highly concise tags.
Tag extraction rules:
1. Tags should cover tech stack, business category, network attribute, or tool attribute (e.g. "Vue", "Docs", "Intranet Ops", "Design", "GitHub", "Cloud Native").
2. Keep tags short and concise (2-6 characters), and drop meaningless filler words.
3. Use the language of each bookmark's name for its tags (Chinese bookmarks keep Chinese tags, English ones keep English tags).
4. Output a strict JSON array; each element must contain:
   - bookmarkId: the corresponding bookmark ID (string)
   - suggestedTags: an array of extracted tag strings (e.g. ["frontend", "tool", "Vue"])
   - reason: a brief extraction note (within 10 characters/words)`,
    taggingUser: 'Extract tags for the following {count} bookmarks and output a JSON array:',

    // ===== Manual copy / data-download mode (prompt-builder.js) =====
    taskAppend: 'extract 1 to {maxTags} additional tags',
    taskReplace: 're-extract 1 to {maxTags} most accurate tags to REPLACE the existing ones',
    manualGrouping: `You are a professional browser-bookmark semantic analysis and categorization assistant.
Task: Given the bookmark data list below (each item has an ID, name, current group and URLs), recommend the best target group for each bookmark.

[Available groups]
{groups}

[Classification rules]
1. Prefer the available groups listed above.
2. {rule}
3. Output a strict JSON array (wrapping it in a \`\`\`json code block is acceptable). Do not add extra chit-chat or explanations.

[Expected JSON format]
[
  {
    "bookmarkId": "the corresponding bookmark ID (keep unchanged)",
    "targetGroupName": "the recommended target group name",
    "isNewGroup": false,
    "reason": "a brief categorization note (within 10 characters/words)"
  }
]`,
    manualTagging: `You are a professional browser-bookmark metadata extraction expert.
Task: Given the bookmark data list below, for each bookmark {task}.

[Tag extraction rules]
1. Tags should cover tech stack, business category, network attribute, or tool attribute (e.g. "Vue", "Docs", "Intranet Ops", "Design", "GitHub", "Cloud Native").
2. Keep tags short and concise (2-6 characters) and drop meaningless filler words.
3. Use the language of each bookmark's name for its tags (Chinese bookmarks keep Chinese tags, English ones keep English tags).
4. Output a strict JSON array (wrapping it in a \`\`\`json code block is acceptable). Do not add extra chit-chat or explanations.

[Expected JSON format]
[
  {
    "bookmarkId": "the corresponding bookmark ID (keep unchanged)",
    "suggestedTags": ["tag1", "tag2"],
    "reason": "a brief extraction note (within 10 characters/words)"
  }
]`,

    // ===== custom-engine.js default expert identity & strict JSON constraint =====
    defaultExpert: 'You are a professional assistant for data classification and bookmark organization.',
    jsonConstraint: '[Strict JSON output]: Return only a plain JSON array. Do NOT wrap it in Markdown code fences (e.g. ```json), and do not add any preamble or closing remarks.'
  }
};
