import { ClassDefinition } from '@pimcore-custom/core';

/**
 * Class Definition & Document Editable Translator
 * Converts Pimcore PHP/JSON layout classes into @pimcore-custom/core definitions.
 */
export function translatePimcoreClassDefinition(pimcoreJson: Record<string, unknown>): ClassDefinition {
  const className = String(pimcoreJson.name || 'UnnamedClass');
  const classId = String(pimcoreJson.id || className.toLowerCase());

  return {
    id: classId,
    name: className,
    fields: []
  };
}
