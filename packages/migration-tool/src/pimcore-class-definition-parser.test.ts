import { describe, it, expect } from 'vitest';
import { parsePimcoreClassDefinitionFile, parsePimcoreClassMeta } from './pimcore-class-definition-parser.js';

// A hand-built but structurally faithful fixture - mirrors the exact
// shapes confirmed against a real Pimcore install's own
// var/classes/definition_Product.php (docs/plans/datamodel/advanced-
// data-modeling-plan.md §5.1/§8 Phase 3), including the real bug this
// parser's balanced-paren block scanner was built to fix: `category`'s
// `optionsProviderClass` appears *after* its own `'name'`, while
// `brand`'s (the very next sibling) is the same shape - a naive
// "text between two 'name' occurrences" window blended the two
// together and resolved `brand`'s relationTarget to "Category".
const FIXTURE = `<?php

/**
* Inheritance: yes
* Variants: yes

Fields Summary:
- localizedfields [localizedfields]
-- name [input]
-- abstract [wysiwyg]
- category [select]
- brand [select]
- technicalSheet [manyToOneRelation]
- variants [block]
-- format [input]
-- flavour [select]
*/

return Pimcore\\Model\\DataObject\\ClassDefinition::__set_state(array(
   'fieldDefinitions' =>
  array (
  ),
   'layoutDefinitions' =>
  Pimcore\\Model\\DataObject\\ClassDefinition\\Layout\\Panel::__set_state(array(
     'childs' =>
    array (
      0 =>
      Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Localizedfields::__set_state(array(
         'name' => 'localizedfields',
         'fieldtype' => 'localizedfields',
         'childs' =>
        array (
          0 =>
          Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Input::__set_state(array(
             'name' => 'name',
             'fieldtype' => 'input',
             'mandatory' => true,
          )),
          1 =>
          Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Wysiwyg::__set_state(array(
             'name' => 'abstract',
             'fieldtype' => 'wysiwyg',
          )),
        ),
      )),
      1 =>
      Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Select::__set_state(array(
         'fieldtype' => 'select',
         'optionsProviderClass' => '@App\\\\OptionsProvider\\\\CategoryOptionsProvider',
         'name' => 'category',
         'mandatory' => false,
      )),
      2 =>
      Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Select::__set_state(array(
         'fieldtype' => 'select',
         'name' => 'brand',
         'mandatory' => true,
         'optionsProviderClass' => '@App\\\\OptionsProvider\\\\BrandOptionsProvider',
      )),
      3 =>
      Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\ManyToOneRelation::__set_state(array(
         'fieldtype' => 'manyToOneRelation',
         'name' => 'technicalSheet',
         'classes' =>
        array (
        ),
         'objectsAllowed' => false,
         'assetsAllowed' => true,
      )),
      4 =>
      Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Block::__set_state(array(
         'fieldtype' => 'block',
         'name' => 'variants',
         'mandatory' => true,
         'childs' =>
        array (
          0 =>
          Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Input::__set_state(array(
             'name' => 'format',
             'fieldtype' => 'input',
             'mandatory' => true,
          )),
          1 =>
          Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\Select::__set_state(array(
             'name' => 'flavour',
             'fieldtype' => 'select',
             'classes' =>
            array (
              0 =>
              array (
                'classes' => 'Flavour',
              ),
            ),
          )),
        ),
      )),
    ),
  )),
));
`;

describe('parsePimcoreClassMeta', () => {
  const head = (props: string) => `<?php\n\nreturn \\Pimcore\\Model\\DataObject\\ClassDefinition::__set_state(array(\n   'dao' => NULL,\n${props}\n   'layoutDefinitions' => \\Pimcore\\Model\\DataObject\\ClassDefinition\\Layout\\Panel::__set_state(array('name' => 'pimcore_root', 'id' => 'x')),\n));`;

  it('reads a numeric id (older Pimcore)', () => {
    expect(parsePimcoreClassMeta(head("   'id' => '12',\n   'name' => 'Product',"))).toEqual({ id: '12', name: 'Product' });
  });

  it('reads a string id (Pimcore 10/11)', () => {
    expect(parsePimcoreClassMeta(head("   'id' => 'CAR',\n   'name' => 'Car',"))).toEqual({ id: 'CAR', name: 'Car' });
  });

  it('reads an id after properties that hold commas or arrays', () => {
    const props = "   'description' => 'Cars, vans, and trucks',\n   'parentClass' => '',\n   'implementsInterfaces' => array (\n    0 => 'A',\n    1 => 'B',\n  ),\n   'listingParentClass' => '',\n   'id' => 'CAR',\n   'name' => 'Car',";
    expect(parsePimcoreClassMeta(head(props))).toEqual({ id: 'CAR', name: 'Car' });
  });

  it('does not take a nested layout panel\'s id/name', () => {
    expect(parsePimcoreClassMeta(head("   'title' => 'No id here',"))).toBeNull();
  });
});

describe('parsePimcoreClassDefinitionFile (docs/plans/datamodel/advanced-data-modeling-plan.md §5.1, Phase 3)', () => {
  const fields = parsePimcoreClassDefinitionFile(FIXTURE);

  it('hoists localizedfields children to top-level with localized: true, dropping the wrapper itself', () => {
    expect(fields.find((f) => f.name === 'localizedfields')).toBeUndefined();
    const name = fields.find((f) => f.name === 'name');
    expect(name).toMatchObject({ fieldType: 'input', localized: true, mandatory: true });
    const abstract = fields.find((f) => f.name === 'abstract');
    expect(abstract).toMatchObject({ fieldType: 'wysiwyg', localized: true });
    expect(abstract?.mandatory).toBeUndefined();
  });

  it("does not bleed a neighboring field's optionsProviderClass into this field's relationTarget - the real bug this parser fixes", () => {
    const category = fields.find((f) => f.name === 'category');
    const brand = fields.find((f) => f.name === 'brand');
    expect(category?.relationTarget).toBe('Category');
    expect(category?.mandatory).toBeUndefined();
    expect(brand?.relationTarget).toBe('Brand');
    expect(brand?.mandatory).toBe(true);
  });

  it('leaves relationTarget unset for a real asset relation (empty classes, assetsAllowed) rather than guessing', () => {
    const technicalSheet = fields.find((f) => f.name === 'technicalSheet');
    expect(technicalSheet?.relationTarget).toBeUndefined();
  });

  it('recursively enriches a block field\'s own child fields, not just top-level ones', () => {
    const variants = fields.find((f) => f.name === 'variants');
    expect(variants?.mandatory).toBe(true);
    expect(variants?.blockFields).toHaveLength(2);
    const format = variants?.blockFields?.find((f) => f.name === 'format');
    const flavour = variants?.blockFields?.find((f) => f.name === 'flavour');
    expect(format?.mandatory).toBe(true);
    expect(flavour?.relationTarget).toBe('Flavour');
  });
});

describe('parsePimcoreClassDefinitionFile: doc-comment prefix', () => {
  it('reads a Fields Summary whose lines start with " * " (as Pimcore writes them)', () => {
    const source = `<?php

/**
 * Inheritance: no
 *
 * Fields Summary:
 * - brand [manyToOneRelation]
 * - name [input]
 * - localizedfields [localizedfields]
 * -- title [input]
 * - variants [block]
 * -- format [input]
 */

return \\Pimcore\\Model\\DataObject\\ClassDefinition::__set_state(array(
   'id' => 'Car',
   'name' => 'Car',
));`;
    const fields = parsePimcoreClassDefinitionFile(source);
    expect(fields.map((f) => f.name)).toEqual(['brand', 'name', 'title', 'variants']);
    expect(fields.find((f) => f.name === 'title')?.localized).toBe(true);
    expect(fields.find((f) => f.name === 'variants')?.blockFields?.map((f) => f.name)).toEqual(['format']);
  });
});
