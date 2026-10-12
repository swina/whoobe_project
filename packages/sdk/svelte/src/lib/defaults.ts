// Default component registry for every primitive node kind - a page renders
// with an empty consumer registry. Override any kind via WhoobeProvider's
// `registry` prop to map it to a design-system component.

import WhoobeContainer from './WhoobeContainer.svelte'
import WhoobeText from './WhoobeText.svelte'
import WhoobeImage from './WhoobeImage.svelte'
import WhoobeLink from './WhoobeLink.svelte'
import WhoobeForm from './WhoobeForm.svelte'
import WhoobeInput from './WhoobeInput.svelte'
import WhoobeTextarea from './WhoobeTextarea.svelte'
import WhoobeSelect from './WhoobeSelect.svelte'
import WhoobeRadioGroup from './WhoobeRadioGroup.svelte'
import WhoobeButton from './WhoobeButton.svelte'
import WhoobeSearch from './WhoobeSearch.svelte'
import WhoobeMedia from './WhoobeMedia.svelte'
import WhoobeTable from './WhoobeTable.svelte'

export const defaults = {
  container: WhoobeContainer,
  heading: WhoobeText,
  paragraph: WhoobeText,
  span: WhoobeText,
  blockquote: WhoobeText,
  code: WhoobeText,
  icon: WhoobeText,
  image: WhoobeImage,
  link: WhoobeLink,
  form: WhoobeForm,
  input: WhoobeInput,
  textarea: WhoobeTextarea,
  select: WhoobeSelect,
  radiogroup: WhoobeRadioGroup,
  button: WhoobeButton,
  submit: WhoobeButton,
  reset: WhoobeButton,
  search: WhoobeSearch,
  video: WhoobeMedia,
  audio: WhoobeMedia,
  youtube: WhoobeMedia,
  vimeo: WhoobeMedia,
  slider: WhoobeMedia,
  table: WhoobeTable,
}
