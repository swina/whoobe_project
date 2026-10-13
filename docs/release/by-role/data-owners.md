# For data and PIM owners

## Your questions
| Question | Answer and where |
|---|---|
| Can it hold our catalogue or master data? | [Data model](../data/data-model.md): runtime classes, field types, relations, components, languages |
| Can we change the model without IT? | Yes, in *Settings > Classes*; changing a field type that has data is checked: [the data model is data](../architecture/design-decisions/the-data-model-is-data.md) |
| Who sees drafts, who publishes? | [Draft is never public](../architecture/design-decisions/draft-is-never-public.md); publish permission; workflows per class |
| Can access be limited per class or per record? | No: permissions are workspace-wide; scopes limit **applications**, not people ([data model, limits](../data/data-model.md)) |
| How do we import from Pimcore, files? | Pimcore: yes (*Settings > Classes > Pimcore*). CSV, JSON, XLSX: not yet |
| How do other systems read the data? | [API clients](../communication/api-clients.md): `data:read:<Class>`, published objects, filtered and paged |
| What about personal data in objects? | [Data protection](../security/data-protection.md) |
| How big can a class be? | Thousands of objects comfortably; filtering is done in the application, not tuned for millions |
