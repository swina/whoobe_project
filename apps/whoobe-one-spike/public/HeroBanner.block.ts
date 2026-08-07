/**
 * Configurazione dello schema compatibile con le specifiche JSON di Whoobe Studio
 */
export const HeroBannerWhoobeBlock = {
  name: 'HeroBanner',
  type: 'component',
  category: 'Marketing',
  icon: 'layout',
  // Struttura a blocchi nidificati generata di default all'interno dell'editor Whoobe
  schema: {
    id: 'root_container_herobanner',
    type: 'flexbox',
    style: { 'display': 'flex', 'flexDirection': 'column', 'padding': '2rem', 'backgroundColor': '#ffffff' },
    children: [
      {
        id: 'heading_element',
        type: 'text',
        content: 'Edit your dynamic HeroBanner block here',
        style: { 'fontSize': '2.25rem', 'fontWeight': '700', 'color': '#111827' }
      }
    ]
  },
  // Proprietà modificabili tramite il pannello ispettore laterale di Whoobe
  editableProps: {
    backgroundColor: { type: 'color', default: '#ffffff' },
    padding: { type: 'select', options: ['p-2', 'p-4', 'p-8', 'p-12'], default: 'p-8' }
  }
};
