import { describe, it, expect } from 'vitest';
import { toRelativeGatewayBinding, ancestorsOf, listLevels } from '../../../apps/whoobe-one-spike/src/scripts/nested-binding-author';

const gw = (fieldPath: string, extra: Record<string, unknown> = {}) => ({ endpointName: 'shop', routePath: '/catalog', fieldPath, params: null, transform: null, ...extra });
const doc: any = {
  id: 'root', type: 'container',
  blocks: [{
    id: 'cats', type: 'container', gatewayBinding: gw('categories', { bindingId: 'b1' }),
    blocks: [
      { id: 'cat-title', type: 'element' },
      { id: 'prods', type: 'container', gatewayBinding: { scope: 'item', fieldPath: 'products' }, blocks: [
        { id: 'prod-title', type: 'element' },
        { id: 'vars', type: 'container', gatewayBinding: { scope: 'item', fieldPath: 'variants' }, blocks: [{ id: 'var-color', type: 'element' }] },
      ] },
    ],
  }, { id: 'outside', type: 'element' }, { id: 'other', type: 'container', gatewayBinding: gw('items', { routePath: '/other' }), blocks: [{ id: 'in-other', type: 'element' }] }],
};

describe('nested gateway bindings: authoring', () => {
  it('finds the ancestors and the lists a node sits in, with their path in the response', () => {
    expect(ancestorsOf(doc, 'var-color')!.map((n) => n.id)).toEqual(['root', 'cats', 'prods', 'vars']);
    expect(ancestorsOf(doc, 'nope')).toBeNull();
    expect(listLevels(ancestorsOf(doc, 'var-color')!).map((l) => l.path)).toEqual(['categories', 'categories.products', 'categories.products.variants']);
  });
  it('a field of the nearest list becomes a field of its item', () => {
    const b: any = toRelativeGatewayBinding(doc, 'cat-title', gw('categories.title'));
    expect(b).toMatchObject({ scope: 'item', fieldPath: 'title' });
    expect(b.endpointName).toBeUndefined();
    expect(b.bindingId).toBeUndefined();
    expect(toRelativeGatewayBinding(doc, 'prod-title', gw('categories.products.title'))).toMatchObject({ scope: 'item', fieldPath: 'title' });
  });
  it('a list below the nearest list is a nested list', () => {
    expect(toRelativeGatewayBinding(doc, 'prods', gw('categories.products'))).toMatchObject({ scope: 'item', fieldPath: 'products' });
    expect(toRelativeGatewayBinding(doc, 'vars', gw('categories.products.variants'))).toMatchObject({ scope: 'item', fieldPath: 'variants' });
  });
  it('a field of an outer item is reached with ^.', () => {
    expect(toRelativeGatewayBinding(doc, 'prod-title', gw('categories.title'))).toMatchObject({ fieldPath: '^.title' });
    expect(toRelativeGatewayBinding(doc, 'var-color', gw('categories.title'))).toMatchObject({ fieldPath: '^.^.title' });
    expect(toRelativeGatewayBinding(doc, 'var-color', gw('categories.products.title'))).toMatchObject({ fieldPath: '^.title' });
  });
  it('keeps what does not belong to a list of the same response unchanged', () => {
    const b = gw('categories.title');
    expect(toRelativeGatewayBinding(doc, 'outside', b)).toBe(b);                                  // not inside any list
    expect(toRelativeGatewayBinding(doc, 'in-other', gw('categories.title'))).toMatchObject({ endpointName: 'shop', fieldPath: 'categories.title' }); // another route
    const meta = gw('meta.total');
    expect(toRelativeGatewayBinding(doc, 'cat-title', meta)).toBe(meta);                        // a path outside the list
    const already = { scope: 'item', fieldPath: 'x', endpointName: 'shop', routePath: '/catalog' } as any;
    expect(toRelativeGatewayBinding(doc, 'cat-title', already)).toBe(already);
  });
  it('keeps transform, filters and pagination chosen in the picker', () => {
    const b: any = toRelativeGatewayBinding(doc, 'prods', gw('categories.products', { filters: [{ field: 'a', operator: 'eq', value: 1 }], transform: { type: 'none' }, rowsPerPage: 5 }));
    expect(b).toMatchObject({ scope: 'item', fieldPath: 'products', filters: [{ field: 'a', operator: 'eq', value: 1 }], rowsPerPage: 5 });
  });
  it('a response that is itself the list: its fields are relative to the item', () => {
    const top: any = { id: 'r', type: 'container', blocks: [{ id: 'l', type: 'container', gatewayBinding: gw(''), blocks: [{ id: 'x', type: 'element' }, { id: 'sub', type: 'container', blocks: [] }] }] };
    expect(toRelativeGatewayBinding(top, 'x', gw('title'))).toMatchObject({ scope: 'item', fieldPath: 'title' });
    expect(toRelativeGatewayBinding(top, 'sub', gw('tags'))).toMatchObject({ scope: 'item', fieldPath: 'tags' });
  });
  it('a list that takes the visitor\'s selection keeps its own route and parameters, even inside a list', () => {
    const b = gw('products', { routePath: '/catalogue/category/{id}', params: { id: '{selection.category}' } });
    expect(toRelativeGatewayBinding(doc, 'prods', b)).toBe(b);
  });
  it('elements inside such a list are relative to it', () => {
    const dyn: any = { id: 'r', type: 'container', blocks: [{ id: 'd', type: 'container', gatewayBinding: gw('products', { routePath: '/catalogue/category/{id}', params: { id: '{selection.category}' } }), blocks: [{ id: 'n', type: 'element' }] }] };
    expect(toRelativeGatewayBinding(dyn, 'n', gw('products.name', { routePath: '/catalogue/category/{id}' }))).toMatchObject({ scope: 'item', fieldPath: 'name' });
  });
});
